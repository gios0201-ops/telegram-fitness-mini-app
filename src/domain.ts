import { z } from "zod";
const number = (min: number, max: number) =>
  z.number().finite().min(min).max(max);
const name = z.string().trim().min(1).max(70);
export const profileSchema = z.object({
  sex: z.enum(["male", "female"]),
  age: number(18, 90).int(),
  height: number(120, 230),
  weight: number(35, 250),
  activity: z.union([
    z.literal(1.2),
    z.literal(1.375),
    z.literal(1.55),
    z.literal(1.725),
    z.literal(1.9),
  ]),
  goal: z.enum(["gain", "maintain"]),
  surplus: number(0, 600),
  proteinPerKg: number(1.2, 2.5),
  fatPerKg: number(0.6, 1.5),
});
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  sex: "male",
  age: 20,
  height: 175,
  weight: 80,
  activity: 1.55,
  goal: "gain",
  surplus: 462,
  proteinPerKg: 2,
  fatPerKg: 1,
};
export function nutrition(input: Profile) {
  const p = profileSchema.parse(input);
  const bmr =
    10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "male" ? 5 : -161);
  const tdee = bmr * p.activity;
  const calories = Math.round(tdee + (p.goal === "gain" ? p.surplus : 0));
  const protein = Math.round(p.weight * p.proteinPerKg);
  const fat = Math.round(p.weight * p.fatPerKg);
  const carbs = Math.floor((calories - protein * 4 - fat * 9) / 4);
  if (carbs < 0)
    throw new Error("Белки и жиры превышают калорийность. Уменьшите их нормы.");
  return { bmr, tdee, calories, protein, fat, carbs };
}
export const muscleSchema = z.enum([
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
]);
export type Muscle = z.infer<typeof muscleSchema>;
export const exerciseSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    name,
    muscle: muscleSchema,
    sets: number(1, 8).int(),
    reps: number(1, 30).int(),
    cue: z.string().max(180),
    setsMin: number(1, 8).int().optional(),
    repsMin: number(1, 30).int().optional(),
    repNote: z.string().max(80).optional(),
    legacyNames: z.array(name).max(20).optional(),
  })
  .refine(
    (e) =>
      (!e.setsMin || e.setsMin <= e.sets) &&
      (!e.repsMin || e.repsMin <= e.reps),
    "Минимум диапазона больше максимума",
  );
export type Exercise = z.infer<typeof exerciseSchema>;
export const planSchema = z.object({
  Push: z.array(exerciseSchema).min(1).max(8),
  Pull: z.array(exerciseSchema).min(1).max(8),
  Legs: z.array(exerciseSchema).min(1).max(8),
});
export type Plan = z.infer<typeof planSchema>;
export type Day = keyof Plan;
export const muscles: Record<Muscle, string> = {
  chest: "Грудь",
  back: "Спина",
  shoulders: "Плечи",
  arms: "Руки",
  legs: "Ноги",
};
export const initialPlan: Plan = {
  Push: [
    {
      id: "bench",
      name: "Жим лёжа",
      muscle: "chest",
      sets: 3,
      reps: 8,
      cue: "Лопатки сведены, стопы устойчивы. Контролируйте опускание.",
    },
    {
      id: "overhead",
      name: "Жим гантелей сидя",
      muscle: "shoulders",
      sets: 3,
      reps: 10,
      cue: "Не прогибайте поясницу. Подберите комфортную амплитуду.",
    },
    {
      id: "triceps",
      name: "Разгибание рук на блоке",
      muscle: "arms",
      sets: 3,
      reps: 12,
      cue: "Локти рядом с корпусом, без рывков.",
    },
  ],
  Pull: [
    {
      id: "pulldown",
      name: "Тяга верхнего блока",
      muscle: "back",
      sets: 3,
      reps: 10,
      cue: "Тяните к верхней части груди, не за голову.",
    },
    {
      id: "row",
      name: "Тяга горизонтального блока",
      muscle: "back",
      sets: 3,
      reps: 10,
      cue: "Сохраняйте нейтральное положение спины.",
    },
    {
      id: "curl",
      name: "Сгибание рук с гантелями",
      muscle: "arms",
      sets: 3,
      reps: 12,
      cue: "Не раскачивайте корпус. Плавно опускайте вес.",
    },
  ],
  Legs: [
    {
      id: "squat",
      name: "Приседание",
      muscle: "legs",
      sets: 3,
      reps: 8,
      cue: "Колени движутся по направлению носков. Начните с комфортной глубины.",
    },
    {
      id: "rdl",
      name: "Румынская тяга",
      muscle: "legs",
      sets: 3,
      reps: 10,
      cue: "Отводите таз назад, держите вес близко к ногам.",
    },
    {
      id: "calf",
      name: "Подъём на носки",
      muscle: "legs",
      sets: 3,
      reps: 15,
      cue: "Плавное движение, без пружинящих рывков.",
    },
  ],
};
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (d) =>
      !isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d,
    "Некорректная дата",
  );
export const weightSchema = z.object({ date: dateSchema, kg: number(35, 250) });
export type Weight = z.infer<typeof weightSchema>;
export const setSchema = z.object({
  kg: number(0, 500),
  reps: number(1, 100).int(),
});
export const sessionSchema = z.object({
  date: dateSchema,
  day: z.enum(["Push", "Pull", "Legs"]),
  exercises: z
    .array(
      z.object({
        name,
        muscle: muscleSchema,
        sets: z.array(setSchema).min(1).max(8),
      }),
    )
    .min(1)
    .max(8),
});
export type Session = z.infer<typeof sessionSchema>;
export type Entry<T> = { key: string; value: T };
export type Data = {
  legacyPlan?: Plan;
  activePlanId?: string;
  profile: Profile;
  plan: Plan;
  weights: Entry<Weight>[];
  sessions: Entry<Session>[];
  foods?: Entry<FoodPage>[];
  journal?: import("./journal").JournalSet[];
  conflicts?: import("./journal").JournalConflict[];
  schedule?: (Day | null)[];
  savedPlan?: boolean;
};
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function volume(s: Session) {
  return s.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((v, set) => v + set.kg * set.reps, 0),
    0,
  );
}

export const foodSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(70),
    grams: number(0.1, 10000),
    calories: number(0, 1000),
    protein: number(0, 100),
    fat: number(0, 100),
    carbs: number(0, 100),
  })
  .refine(
    (f) => f.protein + f.fat + f.carbs <= 100.1,
    "Сумма БЖУ на 100 г не может превышать 100 г",
  );
export type Food = z.infer<typeof foodSchema>;
export const foodPageSchema = z.object({
  date: dateSchema,
  foods: z.array(foodSchema).max(30),
});
export type FoodPage = z.infer<typeof foodPageSchema>;
export function foodNutrition(input: Food) {
  const f = foodSchema.parse(input);
  const factor = f.grams / 100;
  return {
    calories: f.calories * factor,
    protein: f.protein * factor,
    fat: f.fat * factor,
    carbs: f.carbs * factor,
  };
}
