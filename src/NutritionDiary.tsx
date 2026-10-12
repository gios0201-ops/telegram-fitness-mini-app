import { useRef, useState, type FormEvent } from "react";
import {
  foodSchema,
  foodPageSchema,
  foodNutrition,
  nutrition,
  today,
  type Data,
  type Food,
} from "./domain";
import type { Repository } from "./storage";
type Save = (action: (repo: Repository) => Promise<void>) => Promise<boolean>;
const blank = (): Food => ({
  id: crypto.randomUUID(),
  name: "",
  grams: 100,
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
});
export function NutritionDiary({
  data,
  save,
  disabled,
}: {
  data: Data;
  save: Save;
  disabled: boolean;
}) {
  const [date, setDate] = useState(today());
  const [draft, setDraft] = useState<Food>(blank);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const pages = (data.foods ?? []).filter((p) => p.value.date === date);
  const foods = pages.flatMap((p) => p.value.foods);
  const target = nutrition(data.profile);
  const total = foods.reduce(
    (sum, f) => {
      const n = foodNutrition(f);
      return {
        calories: sum.calories + n.calories,
        protein: sum.protein + n.protein,
        fat: sum.fat + n.fat,
        carbs: sum.carbs + n.carbs,
      };
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current || disabled) return;
    const parsed = foodSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    pending.current = true;
    setError("");
    try {
      const existing = pages.find((p) =>
        p.value.foods.some((f) => f.id === draft.id),
      );
      const last = pages.at(-1);
      const next = last ? [...last.value.foods, parsed.data] : [parsed.data];
      const fits =
        next.length <= 30 &&
        JSON.stringify({ date, foods: next }).length <= 4096;
      const page = existing ?? (fits ? last : undefined);
      const key = page?.key ?? `fit_v1_food_${date}_${crypto.randomUUID()}`;
      const updated = existing
        ? existing.value.foods.map((f) => (f.id === draft.id ? parsed.data : f))
        : page
          ? [...page.value.foods, parsed.data]
          : [parsed.data];
      if (
        await save(async (repo) => {
          const current = (await repo.load()).foods?.find((p) => p.key === key);
          if (JSON.stringify(current?.value) !== JSON.stringify(page?.value))
            throw new Error(
              "Дневник изменился на другом устройстве. Обновите данные перед повтором.",
            );
          await repo.save(key, { date, foods: updated }, foodPageSchema);
        })
      )
        setDraft(blank());
    } finally {
      pending.current = false;
    }
  }
  async function remove(food: Food) {
    if (!confirm(`Удалить «${food.name}» из дневника?`)) return;
    const page = pages.find((p) =>
      p.value.foods.some((f) => f.id === food.id),
    )!;
    await save(async (repo) => {
      const current = (await repo.load()).foods?.find(
        (p) => p.key === page.key,
      );
      if (JSON.stringify(current?.value) !== JSON.stringify(page.value))
        throw new Error(
          "Дневник изменился на другом устройстве. Обновите данные.",
        );
      await repo.save(
        page.key,
        {
          ...page.value,
          foods: page.value.foods.filter((f) => f.id !== food.id),
        },
        foodPageSchema,
      );
    });
  }
  return (
    <>
      <section className="panel">
        <h2>Дневник питания</h2>
        <p>
          Вводите КБЖУ с этикетки на 100 г и массу съеденной порции. Каталог
          продуктов и распознавание еды не подключены. Количество приёмов пищи
          выбираете сами.
        </p>
        <label className="field">
          Дата
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => {
              setDate(e.target.value);
              setDraft(blank());
            }}
            required
          />
        </label>
        <div className="macro-grid">
          {(
            [
              ["calories", "Ккал"],
              ["protein", "Белки"],
              ["fat", "Жиры"],
              ["carbs", "Углеводы"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <strong>{Math.round(total[key])}</strong>
              <span>
                {label} / {target[key]}
              </span>
              <small>Остаток: {Math.round(target[key] - total[key])}</small>
            </div>
          ))}
        </div>
        <p className="muted">
          Цель калорийности — оценка. Отрицательный остаток означает превышение
          выбранной цели.
        </p>
      </section>
      <section className="panel">
        <h2>
          {foods.some((f) => f.id === draft.id)
            ? "Редактировать продукт"
            : "Добавить продукт"}
        </h2>
        <form onSubmit={submit}>
          <fieldset disabled={disabled}>
            <label className="field">
              Название продукта
              <input
                value={draft.name}
                maxLength={70}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            {(
              [
                ["grams", "Масса порции, г", 10000],
                ["calories", "Ккал на 100 г", 1000],
                ["protein", "Белки на 100 г", 100],
                ["fat", "Жиры на 100 г", 100],
                ["carbs", "Углеводы на 100 г", 100],
              ] as const
            ).map(([key, label, max]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="number"
                  inputMode="decimal"
                  required
                  min={key === "grams" ? 0.1 : 0}
                  max={max}
                  step="0.1"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.valueAsNumber })
                  }
                />
              </label>
            ))}
            {error && <p role="alert">{error}</p>}
            <button className="primary" type="submit">
              Сохранить продукт
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(blank());
                setError("");
              }}
            >
              Очистить форму
            </button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h2>Продукты за день</h2>
        {foods.length === 0 && <p>Записей пока нет.</p>}
        {foods.map((f) => (
          <article key={f.id}>
            <h3>
              {f.name} · {f.grams} г
            </h3>
            <p>
              {Math.round(foodNutrition(f).calories)} ккал · Б{" "}
              {foodNutrition(f).protein.toFixed(1)} · Ж{" "}
              {foodNutrition(f).fat.toFixed(1)} · У{" "}
              {foodNutrition(f).carbs.toFixed(1)}
            </p>
            <button disabled={disabled} onClick={() => setDraft({ ...f })}>
              Изменить {f.name}
            </button>
            <button disabled={disabled} onClick={() => void remove(f)}>
              Удалить {f.name}
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
