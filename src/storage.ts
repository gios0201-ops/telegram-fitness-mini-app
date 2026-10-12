import type { z } from "zod";
import {
  foodPageSchema,
  nutrition,
  defaultProfile,
  exerciseSchema,
  type Day,
  type Exercise,
  profileSchema,
  planSchema,
  sessionSchema,
  weightSchema,
  type Data,
} from "./domain";
export interface Store {
  keys(): Promise<string[]>;
  get(keys: string[]): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface Cloud {
  getKeys(cb: (error: string | null, keys?: string[]) => void): unknown;
  getItems(
    keys: string[],
    cb: (error: string | null, values?: Record<string, string>) => void,
  ): unknown;
  setItem(
    key: string,
    value: string,
    cb: (error: string | null, ok?: boolean) => void,
  ): unknown;
  removeItem(
    key: string,
    cb: (error: string | null, ok?: boolean) => void,
  ): unknown;
}
export function callback<T>(
  run: (cb: (error: string | null, value?: T) => void) => unknown,
  timeout = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "CloudStorage не ответил. Результат записи неизвестен: обновите данные перед повтором.",
          ),
        ),
      timeout,
    );
    try {
      run((error, value) => {
        clearTimeout(timer);
        if (error)
          reject(
            new Error(
              "Ошибка Telegram CloudStorage. Повторите после проверки соединения.",
            ),
          );
        else if (value === undefined)
          reject(new Error("Telegram вернул пустой ответ. Обновите данные."));
        else resolve(value);
      });
    } catch {
      clearTimeout(timer);
      reject(new Error("Telegram CloudStorage недоступен."));
    }
  });
}
export function cloudStore(cloud: Cloud): Store {
  return {
    keys: () => callback((cb) => cloud.getKeys(cb)),
    get: (keys) =>
      keys.length
        ? callback((cb) => cloud.getItems(keys, cb))
        : Promise.resolve({}),
    set: async (key, value) => {
      if (!(await callback<boolean>((cb) => cloud.setItem(key, value, cb))))
        throw new Error("Telegram не подтвердил сохранение.");
    },
    remove: async (key) => {
      if (!(await callback<boolean>((cb) => cloud.removeItem(key, cb))))
        throw new Error("Telegram не подтвердил удаление.");
    },
  };
}
export function demoStore(storage: Storage): Store {
  const prefix = "fitness-demo-v1-";
  return {
    keys: async () =>
      Object.keys(storage)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
    get: async (keys) =>
      Object.fromEntries(
        keys.map((k) => [k, storage.getItem(prefix + k) || ""]),
      ),
    set: async (k, v) => {
      storage.setItem(prefix + k, v);
    },
    remove: async (k) => {
      storage.removeItem(prefix + k);
    },
  };
}
import { defaultPlan } from "./catalog";
import { z as schema } from "zod";
import {
  defaultSchedule,
  scheduleSchema,
  journalPageSchema,
  eventSchema,
  projectJournal,
  type JournalEvent,
} from "./journal";
const prefix = "fit_v1_";
const owned = (key: string) =>
  key.startsWith(prefix) || key.startsWith("fit_v2_");
const dayPlanSchema = schema
  .array(exerciseSchema)
  .min(1)
  .max(8)
  .refine(
    (list) => new Set(list.map((e) => e.id)).size === list.length,
    "Повторный ID упражнения",
  );
export class Repository {
  private writer = crypto.randomUUID();
  private snapshot: Record<string, string> = {};
  private pending = false;
  constructor(readonly store: Store) {}
  async load(): Promise<Data> {
    const keys = (await this.store.keys()).filter(owned);
    const all: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 50)
      Object.assign(all, await this.store.get(keys.slice(i, i + 50)));
    const data: Data = {
      profile: structuredClone(defaultProfile),
      plan: defaultPlan(),
      schedule: [...defaultSchedule],
      savedPlan: false,
      sessions: [],
      weights: [],
      foods: [],
    };
    const events: JournalEvent[] = [];
    const days: Partial<Record<Day, Exercise[]>> = {};
    for (const key of keys) {
      if (!all[key])
        throw new Error(
          "Не удалось прочитать запись. Сохранение заблокировано: обновите данные.",
        );
      try {
        const v = JSON.parse(all[key]);
        if (key === prefix + "profile") data.profile = profileSchema.parse(v);
        else if (key === prefix + "plan") {
          data.plan = planSchema.parse(v);
          data.savedPlan = true;
        } else if (/^fit_v2_plan_(Push|Pull|Legs)$/.test(key)) {
          days[key.slice("fit_v2_plan_".length) as Day] =
            dayPlanSchema.parse(v);
          data.savedPlan = true;
        } else if (key === "fit_v2_schedule")
          data.schedule = scheduleSchema.parse(v);
        else if (key.startsWith("fit_v2_log_"))
          events.push(...journalPageSchema.parse(v).events);
        else if (key.startsWith(prefix + "session_"))
          data.sessions.push({ key, value: sessionSchema.parse(v) });
        else if (key.startsWith(prefix + "food_"))
          data.foods!.push({ key, value: foodPageSchema.parse(v) });
        else if (key.startsWith(prefix + "weight_"))
          data.weights.push({ key, value: weightSchema.parse(v) });
        else throw new Error("Unknown schema");
      } catch {
        throw new Error(
          "Обнаружена повреждённая или несовместимая запись. Данные не перезаписаны.",
        );
      }
    }
    Object.assign(data.plan, days);
    const ids = Object.values(data.plan)
      .flat()
      .map((e) => e.id);
    if (new Set(ids).size !== ids.length)
      throw new Error(
        "Повторные ID упражнений в программе. Экспортируйте данные.",
      );
    const projected = projectJournal(data, events);
    data.journal = projected.sets;
    data.conflicts = projected.conflicts;
    this.snapshot = all;
    try {
      nutrition(data.profile);
    } catch {
      throw new Error(
        "Сохранённый профиль содержит несовместимые нормы питания. Экспортируйте данные для восстановления.",
      );
    }
    data.weights.sort((a, b) => a.value.date.localeCompare(b.value.date));
    data.sessions.sort((a, b) => b.value.date.localeCompare(a.value.date));
    return data;
  }
  async save<T>(key: string, value: T, schema: z.ZodType<T>) {
    if (!/^fit_v[12]_[A-Za-z0-9_-]+$/.test(key) || key.length > 128)
      throw new Error("Недопустимый ключ.");
    const json = JSON.stringify(schema.parse(value));
    // Conservative UTF-16 length: never exceed Telegram's 4096-character cap.
    if (json.length > 4096)
      throw new Error(
        "Запись превышает 4096 символов. Сократите упражнения или названия.",
      );
    const keys = await this.store.keys();
    if (!keys.includes(key) && keys.length >= 900)
      throw new Error(
        "Достигнут резервный лимит 900 ключей. Экспортируйте историю. Новые страницы не создаются; автоматическая очистка отключена.",
      );
    if (
      Object.hasOwn(this.snapshot, key) &&
      (await this.store.get([key]))[key] !== this.snapshot[key]
    )
      throw new Error(
        "Данные изменились на другом устройстве. Обновите данные перед повтором.",
      );
    await this.store.set(key, json);
    if ((await this.store.get([key]))[key] !== json)
      throw new Error(
        "Не удалось подтвердить сохранённые данные. Обновите данные перед повтором.",
      );
    this.snapshot[key] = json;
  }
  async remove(key: string) {
    if (!owned(key)) throw new Error("Нельзя удалить сторонний ключ.");
    if (
      Object.hasOwn(this.snapshot, key) &&
      (await this.store.get([key]))[key] !== this.snapshot[key]
    )
      throw new Error("Данные изменились. Обновите данные перед удалением.");
    await this.store.remove(key);
    if ((await this.store.get([key]))[key])
      throw new Error("Удаление не подтверждено чтением.");
    delete this.snapshot[key];
  }
  async savePlan(day: Day, exercises: Exercise[]) {
    await this.save(`fit_v2_plan_${day}`, exercises, dayPlanSchema);
  }
  async appendEvent(date: string, input: JournalEvent) {
    if (this.pending) throw new Error("Дождитесь завершения записи.");
    this.pending = true;
    try {
      const event = eventSchema.parse(input);
      const data = await this.load();
      const pages = Object.entries(this.snapshot).filter(([k]) =>
        k.startsWith("fit_v2_log_"),
      );
      for (const [, raw] of pages) {
        const found = journalPageSchema
          .parse(JSON.parse(raw))
          .events.find((e) => e.id === event.id);
        if (found) {
          if (JSON.stringify(found) !== JSON.stringify(event))
            throw new Error("Повторный ID с другим содержимым.");
          return;
        }
      }
      const conflict = data.conflicts?.find((c) => c.target === event.target);
      const current = data.journal?.find((s) => s.id === event.target);
      const expected = conflict
        ? conflict.heads.map((h) => h.revision).sort()
        : current
          ? [current.revision]
          : [];
      // A deleted set's last revision is still in the log; edits must target the visible revision.
      if (
        JSON.stringify([...event.parents].sort()) !== JSON.stringify(expected)
      )
        throw new Error(
          "Подход изменился на другом устройстве. Обновите данные.",
        );
      const root = `fit_v2_log_${date}_${this.writer}_`;
      let index = 0;
      while (true) {
        const key = root + index;
        const existing = this.snapshot[key]
          ? journalPageSchema.parse(JSON.parse(this.snapshot[key]))
          : { date, events: [] };
        const next = { ...existing, events: [...existing.events, event] };
        if (next.events.length <= 50 && JSON.stringify(next).length <= 4096) {
          await this.save(key, next, journalPageSchema);
          return;
        }
        if (!existing.events.length)
          throw new Error(
            "Подход превышает лимит страницы. Сократите заметку.",
          );
        index++;
      }
    } finally {
      this.pending = false;
    }
  }
  async exportRaw() {
    const keys = (await this.store.keys()).filter(owned);
    const raw: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 50)
      Object.assign(raw, await this.store.get(keys.slice(i, i + 50)));
    return raw;
  }
}
