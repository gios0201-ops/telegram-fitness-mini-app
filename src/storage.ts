import type { z } from "zod";
import {
  nutrition,
  defaultProfile,
  initialPlan,
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
const prefix = "fit_v1_";
export class Repository {
  constructor(readonly store: Store) {}
  async load(): Promise<Data> {
    const keys = (await this.store.keys()).filter((k) => k.startsWith(prefix));
    const all: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 50)
      Object.assign(all, await this.store.get(keys.slice(i, i + 50)));
    const data: Data = {
      profile: structuredClone(defaultProfile),
      plan: structuredClone(initialPlan),
      sessions: [],
      weights: [],
    };
    for (const key of keys) {
      if (!all[key])
        throw new Error(
          "Не удалось прочитать запись. Сохранение заблокировано: обновите данные.",
        );
      try {
        const v = JSON.parse(all[key]);
        if (key === prefix + "profile") data.profile = profileSchema.parse(v);
        else if (key === prefix + "plan") data.plan = planSchema.parse(v);
        else if (key.startsWith(prefix + "session_"))
          data.sessions.push({ key, value: sessionSchema.parse(v) });
        else if (key.startsWith(prefix + "weight_"))
          data.weights.push({ key, value: weightSchema.parse(v) });
        else throw new Error("Unknown schema");
      } catch {
        throw new Error(
          "Обнаружена повреждённая или несовместимая запись. Данные не перезаписаны.",
        );
      }
    }
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
    if (!/^fit_v1_[A-Za-z0-9_-]+$/.test(key) || key.length > 128)
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
        "Достигнут резервный лимит 900 записей. Экспортируйте историю и удалите ненужные записи.",
      );
    await this.store.set(key, json);
  }
  async remove(key: string) {
    if (!key.startsWith(prefix))
      throw new Error("Нельзя удалить сторонний ключ.");
    await this.store.remove(key);
  }
  async exportRaw() {
    const keys = (await this.store.keys()).filter((k) => k.startsWith(prefix));
    const raw: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 50)
      Object.assign(raw, await this.store.get(keys.slice(i, i + 50)));
    return raw;
  }
}
