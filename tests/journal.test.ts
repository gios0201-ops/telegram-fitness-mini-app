import { describe, it, expect, vi } from "vitest";
import { Repository, type Store } from "../src/storage";
import {
  analysis,
  journalPageSchema,
  projectJournal,
  type JournalEvent,
  type SetValue,
} from "../src/journal";
import { defaultPlan } from "../src/catalog";
import { initialPlan, type Data } from "../src/domain";
const date = "2026-10-12";
function memory(): Store {
  const map = new Map<string, string>();
  return {
    keys: async () => [...map.keys()],
    get: async (keys) =>
      Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ""])),
    set: async (k, v) => {
      map.set(k, v);
    },
    remove: async (k) => {
      map.delete(k);
    },
  };
}
function value(patch: Partial<SetValue> = {}): SetValue {
  return {
    id: crypto.randomUUID(),
    exerciseId: "bench",
    name: "Жим",
    muscle: "chest",
    date,
    day: "Push",
    workoutId: date + "_Push",
    kg: 80,
    reps: 6,
    note: "",
    createdAt: new Date().toISOString(),
    ...patch,
  };
}
function add(v = value()): JournalEvent {
  return { id: crypto.randomUUID(), target: v.id, parents: [], value: v };
}
describe("Журнал подходов", () => {
  it("полный PPL появляется только без сохранённой программы и не пишет при чтении", async () => {
    const store = memory(),
      repo = new Repository(store);
    expect(
      Object.values((await repo.load()).plan).map((d) => d.length),
    ).toEqual([8, 8, 7]);
    expect(await store.keys()).toEqual([]);
    await store.set("fit_v1_plan", JSON.stringify(initialPlan));
    expect((await repo.load()).plan).toEqual(initialPlan);
  });
  it("группирует множество подходов, проверяет размер страниц и не дублирует действие", async () => {
    const store = memory(),
      repo = new Repository(store),
      event = add();
    await repo.appendEvent(date, event);
    await repo.appendEvent(date, event);
    expect((await repo.load()).journal).toHaveLength(1);
    for (let i = 0; i < 20; i++)
      await repo.appendEvent(date, add(value({ note: "З".repeat(200) })));
    const keys = await store.keys();
    expect(keys.length).toBeLessThan(21);
    const raw = await repo.exportRaw();
    expect(Object.values(raw).every((v) => v.length <= 4096)).toBe(true);
    expect((await new Repository(store).load()).journal).toHaveLength(21);
    expect(
      Object.values(raw).every(
        (v) => journalPageSchema.safeParse(JSON.parse(v)).success,
      ),
    ).toBe(true);
  });
  it("повтор после неизвестного callback результата идемпотентен", async () => {
    const store = memory(),
      repo = new Repository(store),
      event = add(),
      original = store.set;
    let fail = true;
    store.set = async (k, v) => {
      await original(k, v);
      if (fail) {
        fail = false;
        throw new Error("timeout");
      }
    };
    await expect(repo.appendEvent(date, event)).rejects.toThrow("timeout");
    await repo.appendEvent(date, event);
    expect((await repo.load()).journal).toHaveLength(1);
  });
  it("отклоняет повторное действие с другим содержимым", async () => {
    const repo = new Repository(memory()),
      event = add();
    await repo.appendEvent(date, event);
    await expect(
      repo.appendEvent(date, { ...event, value: { ...event.value!, kg: 90 } }),
    ).rejects.toThrow("другим содержимым");
  });
  it("редактирует и удаляет через события, не уничтожая исходную запись", async () => {
    const repo = new Repository(memory()),
      event = add();
    await repo.appendEvent(date, event);
    const edit = {
      id: crypto.randomUUID(),
      target: event.target,
      parents: [event.id],
      value: { ...event.value!, kg: 85 },
    };
    await repo.appendEvent(date, edit);
    expect((await repo.load()).journal?.[0].kg).toBe(85);
    await expect(
      repo.appendEvent(date, { ...edit, id: crypto.randomUUID() }),
    ).rejects.toThrow("изменился");
    await repo.appendEvent(date, {
      id: crypto.randomUUID(),
      target: event.target,
      parents: [edit.id],
      value: null,
    });
    expect((await repo.load()).journal).toHaveLength(0);
    expect(Object.values(await repo.exportRaw()).join("")).toContain(event.id);
  });
  it("два устройства записывают разные страницы; конфликтующие правки сохраняются и разрешаются явно", async () => {
    const store = memory(),
      a = new Repository(store),
      b = new Repository(store),
      event = add();
    await a.appendEvent(date, event);
    await Promise.all([a.appendEvent(date, add()), b.appendEvent(date, add())]);
    expect((await a.load()).journal).toHaveLength(3);
    const edits = [80, 90].map((kg) => ({
      id: crypto.randomUUID(),
      target: event.target,
      parents: [event.id],
      value: { ...event.value!, kg },
    }));
    // Simulate two edits passing the preflight at the same time; keep both immutable pages.
    for (let i = 0; i < edits.length; i++)
      await store.set(
        `fit_v2_log_conflict_${i}`,
        JSON.stringify({ date, events: [edits[i]] }),
      );
    const data = await a.load();
    expect(data.conflicts).toHaveLength(1);
    expect(data.conflicts![0].heads).toHaveLength(2);
    await a.appendEvent(date, {
      id: crypto.randomUUID(),
      target: event.target,
      parents: edits.map((e) => e.id),
      value: edits[1].value,
    });
    const resolved = await a.load();
    expect(resolved.conflicts).toHaveLength(0);
    expect(resolved.journal?.find((s) => s.id === event.target)?.kg).toBe(90);
  });
  it("читает v1 без миграционных записей, сохраняет связь после переименования и правки", async () => {
    const store = memory(),
      repo = new Repository(store);
    const legacy = JSON.stringify({
      date,
      day: "Push",
      exercises: [
        { name: "Жим лёжа", muscle: "chest", sets: [{ kg: 60, reps: 8 }] },
      ],
    });
    await store.set("fit_v1_session_old", legacy);
    await store.set("fit_v1_plan", JSON.stringify(initialPlan));
    let data = await repo.load();
    expect(data.journal?.[0].exerciseId).toBe("bench");
    expect(await store.keys()).toHaveLength(2);
    await repo.savePlan("Push", [
      { ...initialPlan.Push[0], name: "Мой жим", legacyNames: ["Жим лёжа"] },
    ]);
    data = await new Repository(store).load();
    expect(data.journal?.[0].exerciseId).toBe("bench");
    const { revision, ...record } = data.journal![0];
    await repo.appendEvent(date, {
      id: crypto.randomUUID(),
      target: record.id,
      parents: [revision],
      value: { ...record, note: "Исправлено", kg: 65 },
    });
    expect((await repo.load()).journal?.[0].kg).toBe(65);
    expect((await repo.exportRaw()).fit_v1_session_old).toBe(legacy);
  });
  it("не угадывает неоднозначную связь старого названия", async () => {
    const repo = new Repository(memory());
    const data = await repo.load();
    data.plan.Push = [
      { ...data.plan.Push[0], id: "one", name: "Жим" },
      { ...data.plan.Push[0], id: "two", name: "Жим" },
    ];
    data.sessions = [
      {
        key: "fit_v1_session_old",
        value: {
          date,
          day: "Push",
          exercises: [
            { name: "Жим", muscle: "chest", sets: [{ kg: 60, reps: 8 }] },
          ],
        },
      },
    ];
    expect(projectJournal(data, []).sets[0].exerciseId).toMatch(/^archive_/);
  });
  it("последний результат отличается от рекорда; объём суммируется по подходам", () => {
    const sets = [
      {
        ...value({ kg: 100, reps: 5, createdAt: "2026-10-12T10:00:00.000Z" }),
        revision: "one",
      },
      {
        ...value({ kg: 70, reps: 8, createdAt: "2026-10-12T11:00:00.000Z" }),
        revision: "two",
      },
    ];
    expect(analysis(sets)).toMatchObject({
      count: 2,
      bestKg: 100,
      volume: 1060,
      reps: 13,
      bestVolume: 560,
      last: { kg: 70 },
    });
  });
  it("не скрывает неполную цепочку истории", async () => {
    const data = await new Repository(memory()).load();
    expect(() =>
      projectJournal(data, [{ ...add(), parents: ["missing"] }]),
    ).toThrow("Неполная");
  });
  it("контролирует лимит ключей и отказывается от неподтверждённого чтения", async () => {
    const store = memory();
    store.keys = async () =>
      Array.from({ length: 900 }, (_, i) => `other_${i}`);
    await expect(
      new Repository(store).appendEvent(date, add()),
    ).rejects.toThrow("900");
    const bad = memory();
    bad.set = async () => {};
    await expect(new Repository(bad).appendEvent(date, add())).rejects.toThrow(
      "подтвердить",
    );
  });
  it("новая программа сохраняется по дням; все значения помещаются в CloudStorage", async () => {
    const repo = new Repository(memory());
    const plan = defaultPlan();
    for (const day of ["Push", "Pull", "Legs"] as const)
      await repo.savePlan(day, plan[day]);
    expect((await repo.load()).plan).toEqual(plan);
    expect(
      Object.values(await repo.exportRaw()).every((v) => v.length <= 4096),
    ).toBe(true);
  });
});

it("установка PPL сохраняет старый план, стабильные ID истории и замеры", async () => {
  const store = memory();
  await store.set("fit_v1_plan", JSON.stringify(initialPlan));
  await store.set(
    "fit_v1_session_old",
    JSON.stringify({
      date,
      day: "Push",
      exercises: [
        { name: "Жим лёжа", muscle: "chest", sets: [{ kg: 80, reps: 8 }] },
      ],
    }),
  );
  await store.set("fit_v1_weight_old", JSON.stringify({ date, kg: 80 }));
  const repo = new Repository(store);
  const before = await repo.load();
  await repo.installFullPlan(before.plan);
  const after = await repo.load();
  expect(Object.values(after.plan).map((d) => d.length)).toEqual([8, 8, 7]);
  expect(after.journal).toEqual(before.journal);
  expect(after.weights).toEqual(before.weights);
  expect((await repo.exportRaw()).fit_v1_plan).toEqual(
    JSON.stringify(initialPlan),
  );
  expect(after.legacyPlan).toEqual(initialPlan);
  await repo.savePlan(
    "Push",
    after.plan.Push.map((e) => ({ ...e, name: e.name + "!" })),
  );
  expect((await repo.load()).journal).toEqual(before.journal);
});
it("ошибка при копировании не активирует частично записанный полный план", async () => {
  const store = memory();
  await store.set("fit_v1_plan", JSON.stringify(initialPlan));
  const repo = new Repository(store);
  const before = await repo.load();
  const original = store.set;
  let n = 0;
  store.set = async (k, v) => {
    if (++n === 4) throw new Error("offline");
    await original(k, v);
  };
  await expect(repo.installFullPlan(before.plan)).rejects.toThrow("offline");
  expect((await repo.load()).plan).toEqual(initialPlan);
  expect((await repo.exportRaw()).fit_v3_active_plan).toBeUndefined();
});
it("устаревший предварительный просмотр не меняет программу", async () => {
  const store = memory(),
    repo = new Repository(store);
  const before = await repo.load();
  await repo.savePlan("Push", initialPlan.Push);
  await expect(repo.installFullPlan(before.plan)).rejects.toThrow(
    "после просмотра",
  );
  expect((await repo.load()).plan.Push).toEqual(initialPlan.Push);
});
it("повторная установка сохраняет текущую редакцию и исходную связь старых подходов", async () => {
  const store = memory(),
    repo = new Repository(store);
  await store.set("fit_v1_plan", JSON.stringify(initialPlan));
  const first = await repo.load();
  await repo.installFullPlan(first.plan);
  let d = await repo.load();
  await repo.savePlan(
    "Push",
    d.plan.Push.map((e) => ({ ...e, name: e.name + " custom" })),
  );
  d = await repo.load();
  await repo.installFullPlan(d.plan);
  const raw = await repo.exportRaw(),
    root = JSON.parse(raw.fit_v3_active_plan);
  expect(JSON.parse(raw[root.previousDays.Push])).toEqual(d.plan.Push);
  expect((await repo.load()).legacyPlan).toEqual(initialPlan);
});
it("неподтверждённая копия не активирует новую программу", async () => {
  const store = memory(),
    repo = new Repository(store);
  await store.set("fit_v1_plan", JSON.stringify(initialPlan));
  const before = await repo.load(),
    original = store.set;
  store.set = async (k, v) => {
    if (!k.startsWith("fit_v3_plan_")) await original(k, v);
  };
  await expect(repo.installFullPlan(before.plan)).rejects.toThrow(
    "подтвердить",
  );
  expect((await repo.load()).plan).toEqual(initialPlan);
});
