import { describe, expect, it, vi } from "vitest";
import {
  Repository,
  callback,
  cloudStore,
  type Cloud,
  type Store,
} from "../src/storage";
import {
  defaultProfile,
  initialPlan,
  profileSchema,
  planSchema,
  sessionSchema,
} from "../src/domain";
function memory(): Store {
  const m = new Map<string, string>();
  return {
    keys: async () => [...m.keys()],
    get: async (keys) =>
      Object.fromEntries(keys.map((k) => [k, m.get(k) || ""])),
    set: async (k, v) => {
      m.set(k, v);
    },
    remove: async (k) => {
      m.delete(k);
    },
  };
}
describe("Хранилище", () => {
  it("новый пользователь получает демо без записи в CloudStorage", async () => {
    const s = memory();
    const r = new Repository(s);
    expect((await r.load()).profile).toEqual(defaultProfile);
    expect(await s.keys()).toEqual([]);
  });
  it("два Telegram-пользователя с одинаковыми ключами остаются разделены", async () => {
    const a = new Repository(memory()),
      b = new Repository(memory());
    await a.save(
      "fit_v1_profile",
      { ...defaultProfile, weight: 90 },
      profileSchema,
    );
    expect((await a.load()).profile.weight).toBe(90);
    expect((await b.load()).profile.weight).toBe(80);
  });
  it("редактирует профиль и план, сохраняет и удаляет историю", async () => {
    const r = new Repository(memory());
    await r.save(
      "fit_v1_plan",
      { ...initialPlan, Push: initialPlan.Push.slice(0, 1) },
      planSchema,
    );
    await r.save(
      "fit_v1_session_test",
      {
        date: "2026-10-12",
        day: "Push",
        exercises: [
          { name: "Жим", muscle: "chest", sets: [{ kg: 60, reps: 8 }] },
        ],
      },
      sessionSchema,
    );
    expect((await r.load()).sessions).toHaveLength(1);
    await r.remove("fit_v1_session_test");
    expect((await r.load()).sessions).toHaveLength(0);
  });
  it("не записывает слишком длинное значение", async () => {
    const s = memory();
    const set = vi.spyOn(s, "set");
    const r = new Repository(s);
    const plan = structuredClone(initialPlan);
    for (const day of ["Push", "Pull", "Legs"] as const)
      plan[day] = Array.from({ length: 8 }, (_, i) => ({
        ...initialPlan[day][0],
        id: `ex${i}`,
        name: "А".repeat(70),
        cue: "Б".repeat(180),
      }));
    await expect(r.save("fit_v1_plan", plan, planSchema)).rejects.toThrow(
      "4096",
    );
    expect(set).not.toHaveBeenCalled();
  });
  it("сохраняет существующий ключ при лимите, отклоняет новый", async () => {
    const s = memory();
    s.keys = async () => [
      "fit_v1_profile",
      ...Array.from({ length: 899 }, (_, i) => `other_${i}`),
    ];
    const r = new Repository(s);
    await r.save("fit_v1_profile", defaultProfile, profileSchema);
    await expect(
      r.save("fit_v1_new", defaultProfile, profileSchema),
    ).rejects.toThrow("900");
  });
  it("не подменяет повреждённые данные пустой историей", async () => {
    const s = memory();
    await s.set("fit_v1_profile", "bad json");
    await expect(new Repository(s).load()).rejects.toThrow("повреждённая");
    expect((await s.get(["fit_v1_profile"])).fit_v1_profile).toBe("bad json");
  });
  it("не допускает пропущенные записи и чужие ключи", async () => {
    const s = memory();
    s.keys = async () => ["fit_v1_profile"];
    await expect(new Repository(s).load()).rejects.toThrow("прочитать");
    await expect(new Repository(s).remove("other_data")).rejects.toThrow(
      "сторонний",
    );
  });
  it("читает и экспортирует более 50 ключей батчами", async () => {
    const s = memory();
    for (let i = 0; i < 80; i++)
      await s.set(
        `fit_v1_weight_${i}`,
        JSON.stringify({ date: "2026-10-12", kg: 80 }),
      );
    const get = vi.spyOn(s, "get");
    const r = new Repository(s);
    expect((await r.load()).weights).toHaveLength(80);
    expect(get.mock.calls.every(([keys]) => keys.length <= 50)).toBe(true);
    expect(Object.keys(await r.exportRaw())).toHaveLength(80);
  });
  it("показывает ошибку callback и false-подтверждение", async () => {
    const cloud = {
      setItem: (
        _k: string,
        _v: string,
        cb: (e: string | null, ok?: boolean) => void,
      ) => cb("offline", false),
    } as Cloud;
    await expect(cloudStore(cloud).set("k", "v")).rejects.toThrow(
      "Ошибка Telegram",
    );
    cloud.setItem = (_k, _v, cb) => cb(null, false);
    await expect(cloudStore(cloud).set("k", "v")).rejects.toThrow(
      "не подтвердил",
    );
  });
  it("таймаут честно указывает неизвестный результат записи", async () => {
    await expect(callback(() => {}, 5)).rejects.toThrow("неизвестен");
  });
});
