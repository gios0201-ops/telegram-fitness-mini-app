import { describe, expect, it } from "vitest";
import {
  defaultProfile,
  nutrition,
  profileSchema,
  dateSchema,
  sessionSchema,
  volume,
} from "../src/domain";
describe("Питание", () => {
  it("демо: Миффлин, TDEE, профицит и БЖУ", () => {
    const n = nutrition(defaultProfile);
    expect(n.bmr).toBe(1798.75);
    expect(n.tdee).toBeCloseTo(2788.0625);
    expect(n.calories).toBe(3250);
    expect([n.protein, n.fat, n.carbs]).toEqual([160, 80, 472]);
    expect(
      Math.abs(n.protein * 4 + n.fat * 9 + n.carbs * 4 - n.calories),
    ).toBeLessThanOrEqual(2);
  });
  it("женская константа и поддержание", () => {
    const n = nutrition({ ...defaultProfile, sex: "female", goal: "maintain" });
    expect(n.bmr).toBe(1632.75);
    expect(n.calories).toBe(Math.round(1632.75 * 1.55));
  });
  it("изменение активности меняет TDEE", () =>
    expect(nutrition({ ...defaultProfile, activity: 1.2 }).tdee).toBeLessThan(
      nutrition(defaultProfile).tdee,
    ));
  it.each([NaN, Infinity, -5, 0, 900])("отклоняет вес %s", (weight) =>
    expect(profileSchema.safeParse({ ...defaultProfile, weight }).success).toBe(
      false,
    ),
  );
  it("не допускает отрицательные углеводы", () =>
    expect(() =>
      nutrition({
        ...defaultProfile,
        weight: 250,
        height: 120,
        age: 90,
        activity: 1.2,
        goal: "maintain",
        proteinPerKg: 2.5,
        fatPerKg: 1.5,
      }),
    ).toThrow("превышают"));
});
it("проверяет реальные календарные даты", () => {
  expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
  expect(dateSchema.safeParse("2024-02-29").success).toBe(true);
});
it("считает рабочий объём по каждому подходу", () => {
  const s = sessionSchema.parse({
    date: "2026-10-12",
    day: "Push",
    exercises: [
      {
        name: "Жим",
        muscle: "chest",
        sets: [
          { kg: 60, reps: 8 },
          { kg: 65, reps: 6 },
        ],
      },
    ],
  });
  expect(volume(s)).toBe(870);
});
