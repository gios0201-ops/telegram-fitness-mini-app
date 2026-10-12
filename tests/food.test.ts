import { describe, it, expect } from "vitest";
import { foodNutrition, foodSchema, foodPageSchema } from "../src/domain";
import { Repository, type Store } from "../src/storage";
const food = {
  id: "bd22483e-e66b-4bc6-9a96-db199ad56855",
  name: "Овсянка",
  grams: 150,
  calories: 370,
  protein: 13,
  fat: 7,
  carbs: 60,
};
function memory(): Store {
  const values: Record<string, string> = {};
  return {
    keys: async () => Object.keys(values),
    get: async (keys) =>
      Object.fromEntries(keys.map((k) => [k, values[k] ?? ""])),
    set: async (k, v) => {
      values[k] = v;
    },
    remove: async (k) => {
      delete values[k];
    },
  };
}
describe("Дневник питания", () => {
  it("считает КБЖУ порции по массе", () => {
    expect(foodNutrition(food)).toEqual({
      calories: 555,
      protein: 19.5,
      fat: 10.5,
      carbs: 90,
    });
  });
  it("отклоняет отрицательные значения, NaN и невозможную сумму БЖУ", () => {
    expect(foodSchema.safeParse({ ...food, grams: -1 }).success).toBe(false);
    expect(foodSchema.safeParse({ ...food, calories: NaN }).success).toBe(
      false,
    );
    expect(foodSchema.safeParse({ ...food, protein: 90 }).success).toBe(false);
  });
  it("сохраняет сгруппированную страницу, читает после повторного открытия и экспортирует", async () => {
    const store = memory(),
      repo = new Repository(store);
    const key = "fit_v1_food_2026-10-12_page";
    await repo.save(key, { date: "2026-10-12", foods: [food] }, foodPageSchema);
    expect((await new Repository(store).load()).foods?.[0].value.foods).toEqual(
      [food],
    );
    expect(JSON.parse((await repo.exportRaw())[key]).foods).toEqual([food]);
    expect((await new Repository(memory()).load()).foods).toEqual([]);
  });
  it("не подтверждает запись, если повторное чтение не совпало", async () => {
    const store = memory();
    store.set = async () => {};
    await expect(
      new Repository(store).save(
        "fit_v1_food_page",
        { date: "2026-10-12", foods: [food] },
        foodPageSchema,
      ),
    ).rejects.toThrow("подтвердить");
  });
});
