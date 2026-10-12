import { useEffect, useRef, useState, type FormEvent } from "react";
import { muscles, today, type Data, type Day, type Exercise } from "./domain";
import {
  analysis,
  eventSchema,
  journalSetSchema,
  type JournalEvent,
  type JournalSet,
  type SetValue,
} from "./journal";
import { catalogById, ranges } from "./catalog";
import type { Repository } from "./storage";
import { telegramBack } from "./telegram";
export type Save = (
  action: (repo: Repository) => Promise<void>,
) => Promise<boolean>;
export type Draft = { kg: string; reps: string; note: string; date: string };
export function MuscleDiagram({
  exercise,
  small = false,
}: {
  exercise: Exercise;
  small?: boolean;
}) {
  const secondary = catalogById[exercise.id]?.secondary ?? [];
  const color = (m: string) =>
    m === exercise.muscle
      ? "var(--accent)"
      : secondary.includes(m as never)
        ? "#dfad67"
        : "var(--muted)";
  return (
    <svg
      viewBox="0 0 240 230"
      className={small ? "muscle-diagram small" : "muscle-diagram"}
      role="img"
      aria-label={`Авторская схема мышц: ${muscles[exercise.muscle]}`}
    >
      <title>Вид спереди и сзади. Условная схема групп мышц.</title>
      {[0, 120].map((x, i) => (
        <g
          transform={`translate(${x},0)`}
          key={x}
          stroke="var(--bg)"
          strokeWidth="2"
        >
          <circle cx="60" cy="27" r="15" fill="var(--muted)" />
          <path
            d="M44 46 L76 46 L91 67 L82 118 L72 136 L76 210 L60 210 L60 148 L55 210 L39 210 L43 136 L34 118 L28 67Z"
            fill="var(--muted)"
            opacity=".35"
          />
          <path
            d="M31 55 Q20 60 23 79 L39 79 L44 53 M77 53 L82 79 L98 79 Q99 60 89 55"
            fill={color("shoulders")}
          />
          <path
            d="M22 80 L39 80 L34 125 L19 129Z M82 80 L99 80 L102 129 L87 125Z"
            fill={color("arms")}
          />
          {i === 0 ? (
            <path
              d="M44 56 L58 54 L59 80 L40 78Z M62 54 L77 56 L81 78 L62 80Z"
              fill={color("chest")}
            />
          ) : (
            <path
              d="M43 55 L77 55 L80 94 L61 121 L40 94Z"
              fill={color("back")}
            />
          )}
          <path
            d="M42 137 L58 141 L56 178 L42 176Z M62 141 L77 137 L77 176 L64 178Z M42 181 L56 181 L53 210 L39 210Z M65 181 L78 181 L80 210 L66 210Z"
            fill={color("legs")}
          />
          <text
            x="60"
            y="227"
            textAnchor="middle"
            stroke="none"
            fill="var(--muted)"
            fontSize="10"
          >
            {i === 0 ? "СПЕРЕДИ" : "СЗАДИ"}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function ExerciseScreen({
  exercise,
  day,
  data,
  save,
  disabled,
  back,
  draft,
  changeDraft,
}: {
  exercise: Exercise;
  day: Day;
  data: Data;
  save: Save;
  disabled: boolean;
  back: () => void;
  draft: Draft;
  changeDraft: (draft: Draft) => void;
}) {
  const sets = (data.journal ?? []).filter((s) => s.exerciseId === exercise.id);
  const stats = analysis(sets);
  const todaySets = sets.filter((s) => s.date === draft.date);
  const detail = catalogById[exercise.id];
  const [editing, setEditing] = useState<JournalSet>();
  const [editDraft, setEditDraft] = useState({ kg: "", reps: "", note: "" });
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const pending = useRef<JournalEvent | null>(null);
  const [assign, setAssign] = useState("");
  useEffect(() => telegramBack(back), [back]);
  async function record(repeat?: JournalSet) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setError("");
    try {
      if (!pending.current) {
        const id = crypto.randomUUID();
        const value = journalSetSchema.parse({
          id,
          exerciseId: exercise.id,
          name: exercise.name,
          muscle: exercise.muscle,
          kg: repeat?.kg ?? (draft.kg.trim() ? Number(draft.kg) : NaN),
          reps: repeat?.reps ?? Number(draft.reps),
          note: repeat?.note ?? draft.note,
          day,
          date: draft.date,
          workoutId: `${draft.date}_${day}`,
          createdAt: new Date().toISOString(),
        });
        pending.current = {
          id: crypto.randomUUID(),
          target: id,
          parents: [],
          value,
        };
      }
      if (await save((r) => r.appendEvent(draft.date, pending.current!))) {
        pending.current = null;
        changeDraft({ ...draft, note: "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте поля подхода.");
    } finally {
      inFlight.current = false;
    }
  }
  async function mutate(set: JournalSet, value: SetValue | null) {
    const { revision } = set;
    const event = eventSchema.parse({
      id: crypto.randomUUID(),
      target: set.id,
      parents: [revision],
      value,
    });
    return save((r) => r.appendEvent(set.date, event));
  }
  async function edit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const { revision, ...old } = editing;
      const value = journalSetSchema.parse({
        ...old,
        kg: Number(editDraft.kg),
        reps: Number(editDraft.reps),
        note: editDraft.note,
      });
      if (await mutate(editing, value)) setEditing(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверьте поля.");
    }
  }
  const conflicts = (data.conflicts ?? []).filter(
    (c) =>
      c.exerciseId === exercise.id ||
      c.heads.some((h) => h.value?.exerciseId === exercise.id),
  );
  const dates = [...new Set(sets.map((s) => s.date))].sort();
  return (
    <div className="exercise-screen">
      <button type="button" className="exercise-back" onClick={back}>
        ← Назад к программе
      </button>
      <section className="panel exercise-header">
        <p className="eyebrow">
          {day} · {muscles[exercise.muscle]}
        </p>
        <h2>{exercise.name}</h2>
        <p>План: {ranges(exercise)}</p>
        <MuscleDiagram exercise={exercise} />
        <details>
          <summary>Техника и работающие мышцы</summary>
          <p>{exercise.cue}</p>
          <p>
            Дополнительно:{" "}
            {detail?.secondary.map((m) => muscles[m]).join(", ") ||
              "Не указано"}
            .
          </p>
          <p>
            Типичные ошибки:{" "}
            {detail?.errors || "Рывки, потеря контроля, болезненная амплитуда."}
          </p>
          <small>
            Авторская схема, не демонстрация движения. Подберите нагрузку и
            комфортную амплитуду самостоятельно.
          </small>
        </details>
      </section>
      <section className="panel">
        <h2>Записать подход</h2>
        <p>
          Записано за выбранную дату:{" "}
          <strong data-testid="today-set-count">{todaySets.length}</strong>
        </p>
        <p>
          Последний результат:{" "}
          {stats.last
            ? `${stats.last.kg} кг × ${stats.last.reps} · ${stats.last.date}`
            : "Пока нет. Рабочий вес выбираете сами."}
        </p>
        <button
          type="button"
          disabled={disabled || !stats.last}
          onClick={() =>
            stats.last &&
            changeDraft({
              ...draft,
              kg: String(stats.last.kg),
              reps: String(stats.last.reps),
              note: stats.last.note,
            })
          }
        >
          Подставить
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void record();
          }}
        >
          <fieldset disabled={disabled}>
            <label className="field">
              Дата подхода
              <input
                type="date"
                max={today()}
                required
                value={draft.date}
                onChange={(e) =>
                  changeDraft({ ...draft, date: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Вес, кг
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="500"
                  step="0.1"
                  required
                  value={draft.kg}
                  onChange={(e) =>
                    changeDraft({ ...draft, kg: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Повторения
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  step="1"
                  required
                  value={draft.reps}
                  onChange={(e) =>
                    changeDraft({ ...draft, reps: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              Заметка
              <textarea
                aria-label="Заметка"
                value={draft.note}
                maxLength={200}
                rows={2}
                onChange={(e) =>
                  changeDraft({ ...draft, note: e.target.value })
                }
              />
            </label>
            <button className="record-set" type="submit">
              Записать подход
            </button>
            <button
              type="button"
              disabled={!stats.last}
              onClick={() => stats.last && void record(stats.last)}
            >
              Повторить прошлый подход
            </button>
          </fieldset>
        </form>
        <small>
          0 кг — без внешнего отягощения. Вес собственного тела не добавляется
          автоматически.
        </small>
      </section>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <h2>Анализ упражнения</h2>
        <dl className="exercise-analysis">
          <div>
            <dt>Подходов</dt>
            <dd data-testid="analysis-count">{stats.count}</dd>
          </div>
          <div>
            <dt>Лучший вес / личный рекорд</dt>
            <dd>{stats.bestKg} кг</dd>
          </div>
          <div>
            <dt>Объём</dt>
            <dd data-testid="analysis-volume">{stats.volume} кг × повт.</dd>
          </div>
          <div>
            <dt>Повторений</dt>
            <dd>{stats.reps}</dd>
          </div>
          <div>
            <dt>Рекорд объёма одного подхода</dt>
            <dd>{stats.bestVolume} кг × повт.</dd>
          </div>
        </dl>
        {sets.length > 1 && (
          <p>
            Последний к предыдущему: {sets[0].kg - sets[1].kg > 0 ? "+" : ""}
            {sets[0].kg - sets[1].kg} кг;{" "}
            {sets[0].reps - sets[1].reps > 0 ? "+" : ""}
            {sets[0].reps - sets[1].reps} повт.
          </p>
        )}
        <details>
          <summary>Динамика по датам</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Вес, максимум</th>
                  <th>Объём</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const a = analysis(sets.filter((s) => s.date === date));
                  return (
                    <tr key={date}>
                      <td>{date}</td>
                      <td>{a.bestKg} кг</td>
                      <td>{a.volume}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      {!Object.values(data.plan)
        .flat()
        .some((e) => e.id === exercise.id) && (
        <section className="panel">
          <h2>Связать архив с упражнением</h2>
          <p>
            Сначала экспортируйте данные в профиле. Выберите упражнение вручную:
            исходная тренировка останется в архиве без изменений.
          </p>
          <select
            aria-label="Упражнение для архива"
            value={assign}
            onChange={(e) => setAssign(e.target.value)}
          >
            <option value="">Выберите упражнение</option>
            {data.plan[day].map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            disabled={disabled || !assign}
            onClick={async () => {
              for (const set of sets) {
                const { revision, ...value } = set;
                if (!(await mutate(set, { ...value, exerciseId: assign })))
                  break;
              }
            }}
          >
            Связать подходы
          </button>
        </section>
      )}
      {conflicts.map((c) => (
        <section className="panel" key={c.target}>
          <h2>Конфликт изменений</h2>
          <p>
            Обе версии сохранены. Выберите вариант, который следует оставить.
          </p>
          {c.heads.map((h) => (
            <button
              key={h.revision}
              disabled={disabled}
              onClick={() =>
                void save((r) =>
                  r.appendEvent(h.value?.date ?? today(), {
                    id: crypto.randomUUID(),
                    target: c.target,
                    parents: c.heads.map((x) => x.revision),
                    value: h.value,
                  }),
                )
              }
            >
              {h.value
                ? `${h.value.kg} кг × ${h.value.reps} · ${h.value.note}`
                : "Удалённый подход"}
            </button>
          ))}
        </section>
      ))}
      <section className="panel">
        <h2>История подходов</h2>
        {sets.length === 0 && <p>Подходов пока нет.</p>}
        {sets.map((set) => (
          <article className="set-history" key={set.id}>
            <h3>
              {set.date} · {set.kg} кг × {set.reps}
            </h3>
            {set.note && <p>{set.note}</p>}
            <div className="button-row">
              <button
                disabled={disabled}
                onClick={() => {
                  setEditing(set);
                  setEditDraft({
                    kg: String(set.kg),
                    reps: String(set.reps),
                    note: set.note,
                  });
                }}
              >
                Изменить подход
              </button>
              <button
                disabled={disabled}
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      "Удалить этот подход? Исходная запись останется в архиве изменений.",
                    )
                  )
                    void mutate(set, null);
                }}
              >
                Удалить подход
              </button>
            </div>
            {editing?.id === set.id && (
              <form onSubmit={edit}>
                <fieldset disabled={disabled}>
                  <label className="field">
                    Исправленный вес, кг
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="0.1"
                      required
                      value={editDraft.kg}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, kg: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Исправленные повторения
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={editDraft.reps}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, reps: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Исправленная заметка
                    <textarea
                      aria-label="Исправленная заметка"
                      maxLength={200}
                      value={editDraft.note}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, note: e.target.value })
                      }
                    />
                  </label>
                  <button type="submit">Сохранить исправление</button>
                  <button type="button" onClick={() => setEditing(undefined)}>
                    Отменить исправление
                  </button>
                </fieldset>
              </form>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
