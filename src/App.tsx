import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  defaultProfile,
  initialPlan,
  muscles,
  nutrition,
  planSchema,
  profileSchema,
  sessionSchema,
  today,
  volume,
  weightSchema,
  type Data,
  type Day,
  type Exercise,
  type Muscle,
  type Plan,
  type Profile,
  type Session,
} from "./domain";
import { createRepository, haptic, initTelegram } from "./telegram";
import { Repository } from "./storage";
type Tab = "Сегодня" | "Тренировки" | "Прогресс" | "Профиль";
type Save = (action: (repo: Repository) => Promise<void>) => Promise<boolean>;
const tabs: Tab[] = ["Сегодня", "Тренировки", "Прогресс", "Профиль"];
const icons = ["◉", "↗", "▥", "◎"];
const dateText = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function MuscleMap({ muscle }: { muscle: Muscle }) {
  const active = (m: Muscle) => (m === muscle ? "muscle active" : "muscle");
  return (
    <svg
      className="muscle-map"
      viewBox="0 0 160 190"
      role="img"
      aria-label={`Схема: ${muscles[muscle]}`}
    >
      <circle cx="80" cy="22" r="15" className="body" />
      <path
        d="M65 42 L95 42 L111 61 L104 114 L98 129 L62 129 L56 114 L49 61 Z"
        className="body"
      />
      <path
        d="M61 48 L77 48 L77 73 L60 69 Z M83 48 L99 48 L100 69 L83 73 Z"
        className={active("chest")}
      />
      <path
        d="M62 77 L76 80 L76 108 L65 111 Z M84 80 L98 77 L95 111 L84 108 Z"
        className={active("back")}
      />
      <path
        d="M49 47 L61 46 L58 67 L44 67 Z M99 46 L111 47 L116 67 L102 67 Z"
        className={active("shoulders")}
      />
      <path
        d="M43 71 L56 72 L47 113 L35 110 Z M104 72 L117 71 L125 110 L113 113 Z"
        className={active("arms")}
      />
      <path
        d="M62 132 L77 132 L73 181 L59 181 Z M83 132 L98 132 L101 181 L87 181 Z"
        className={active("legs")}
      />
    </svg>
  );
}
function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <details className="exercise-card">
      <summary>
        <span className="exercise-mark">↗</span>
        <span>
          <strong>{exercise.name}</strong>
          <small>
            {muscles[exercise.muscle]} · {exercise.sets} × {exercise.reps}
          </small>
        </span>
        <span className="expand">+</span>
      </summary>
      <div className="exercise-detail">
        <MuscleMap muscle={exercise.muscle} />
        <div>
          <h3>{muscles[exercise.muscle]}</h3>
          <p>{exercise.cue}</p>
          <small>
            Условная авторская схема групп мышц, не инструкция техники. Спина
            показана условно на той же схеме. При боли остановитесь.
          </small>
        </div>
      </div>
    </details>
  );
}
export function App() {
  const [context, setContext] = useState<{
    repo: Repository;
    mode: "telegram" | "demo";
  }>();
  const [data, setData] = useState<Data>();
  const [tab, setTab] = useState<Tab>("Сегодня");
  const [day, setDay] = useState<Day>("Push");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  useEffect(() => {
    let live = true;
    let cleanup = () => {};
    try {
      cleanup = initTelegram();
      const c = createRepository();
      setContext(c);
      c.repo
        .load()
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) {
            setBlocked(true);
            setError(message(e));
          }
        });
    } catch (e) {
      setError(message(e));
      setBlocked(true);
    }
    return () => {
      live = false;
      cleanup();
    };
  }, []);
  async function reload() {
    if (!context) {
      location.reload();
      return;
    }
    setBusy(true);
    setError("");
    try {
      setData(await context.repo.load());
      setBlocked(false);
      setNotice("Данные обновлены");
    } catch (e) {
      setError(message(e));
      setBlocked(true);
    } finally {
      setBusy(false);
    }
  }
  const save: Save = async (action) => {
    if (!context || busy || blocked) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action(context.repo);
      setData(await context.repo.load());
      setNotice("Сохранено");
      haptic();
      return true;
    } catch (e) {
      setError(message(e));
      setBlocked(true);
      haptic(false);
      return false;
    } finally {
      setBusy(false);
    }
  };
  async function exportData() {
    if (!context) return;
    setBusy(true);
    try {
      const raw = await context.repo.exportRaw();
      const blob = new Blob(
        [
          JSON.stringify(
            { version: 1, exportedAt: new Date().toISOString(), records: raw },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fitness-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice(
        "Экспорт подготовлен. Файл содержит личные данные. Если Telegram блокирует скачивание, откройте приложение в Telegram Desktop.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const n = data ? nutrition(data.profile) : undefined;
  const disabled = busy || blocked;
  const weightChange =
    data && data.weights.length > 1
      ? data.weights.at(-1)!.value.kg - data.weights[0].value.kg
      : undefined;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Сегодня");
          }}
        >
          <span className="brand-icon">↗</span>рост
          <span className="brand-dot">.</span>
        </a>
        <span className="tag">FITNESS / MINI APP</span>
      </header>
      {context?.mode === "demo" && (
        <aside className="demo">
          Демо в браузере · данные только на этом устройстве. Облачное
          сохранение — при запуске из Telegram.
        </aside>
      )}
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">ТВОЙ РИТМ. ТВОЙ ПРОГРЕСС.</p>
            <h1>{tab === "Сегодня" ? "Становись сильнее" : tab}</h1>
          </div>
          <span className="date-chip">
            {new Date().toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
            })}
          </span>
        </div>
        {error && (
          <div role="alert" className="alert">
            <strong>Не удалось завершить действие</strong>
            <p>{error}</p>
            <div className="button-row">
              <button disabled={busy} onClick={reload}>
                Обновить данные
              </button>
              {context && (
                <button disabled={busy} onClick={exportData}>
                  Экспорт JSON
                </button>
              )}
            </div>
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {!data && !error && <p role="status">Загружаем ваши данные…</p>}
        {data && n && (
          <>
            {tab === "Сегодня" && (
              <>
                <section className="hero">
                  <div>
                    <p className="eyebrow">ПЛАН НА ДЕНЬ</p>
                    <h2>
                      Маленькие шаги.
                      <br />
                      Большие изменения.
                    </h2>
                    <p>
                      Тренируйся, восстанавливайся и наблюдай за прогрессом.
                    </p>
                    <button onClick={() => setTab("Тренировки")}>
                      Начать тренировку <span>↗</span>
                    </button>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit" />
                    <span>↑</span>
                    <small>
                      GROW
                      <br />
                      AT YOUR PACE
                    </small>
                  </div>
                </section>
                <div className="section-title">
                  <h2>Твой ориентир питания</h2>
                  <span className="badge">
                    {data.profile.goal === "gain"
                      ? "Набор массы"
                      : "Поддержание"}
                  </span>
                </div>
                <div className="nutrition-grid">
                  <div className="calorie-card">
                    <small>ЭНЕРГИЯ / ДЕНЬ</small>
                    <strong>
                      {n.calories.toLocaleString("ru-RU")}
                      <span>ккал</span>
                    </strong>
                    <p>Оценочный TDEE: {Math.round(n.tdee)} ккал</p>
                  </div>
                  <div className="macro-card">
                    <Macro
                      name="Белки"
                      amount={n.protein}
                      className="protein"
                    />
                    <Macro name="Жиры" amount={n.fat} className="fat" />
                    <Macro name="Углеводы" amount={n.carbs} className="carbs" />
                  </div>
                </div>
                <p className="hint">
                  Это стартовая оценка, а не точная потребность. Сверяйте её с
                  динамикой веса за 2–3 недели. Частоту приёмов пищи выбирайте
                  сами.
                </p>
                <div className="section-title">
                  <h2>Тренировка по твоему плану</h2>
                  <button
                    className="text-button"
                    onClick={() => setTab("Тренировки")}
                  >
                    Открыть →
                  </button>
                </div>
                <div className="split-grid">
                  {(["Push", "Pull", "Legs"] as Day[]).map((d, i) => (
                    <button
                      className="split-card"
                      key={d}
                      onClick={() => {
                        setDay(d);
                        setTab("Тренировки");
                      }}
                    >
                      <small>
                        0{i + 1} / {["ЖИМ", "ТЯГА", "НОГИ"][i]}
                      </small>
                      <strong>
                        {d}
                        <span>↗</span>
                      </strong>
                      <span>{data.plan[d].length} упражнения</span>
                    </button>
                  ))}
                </div>
                <section className="mini-stats">
                  <div>
                    <strong>{data.sessions.length}</strong>
                    <span>тренировок записано</span>
                  </div>
                  <div>
                    <strong>
                      {data.weights.at(-1)?.value.kg ?? data.profile.weight}
                      <small> кг</small>
                    </strong>
                    <span>последний вес</span>
                  </div>
                  <div>
                    <strong>
                      {weightChange === undefined
                        ? "—"
                        : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)}`}
                      <small> кг</small>
                    </strong>
                    <span>изменение за историю</span>
                  </div>
                </section>
              </>
            )}
            {tab === "Профиль" && (
              <>
                <section className="panel">
                  <h2>Твои исходные данные</h2>
                  <p className="hint">
                    Стартовый профиль демонстрационный. Обновите анкету под
                    себя. Калькулятор предназначен для взрослых.
                  </p>
                  <fieldset disabled={disabled}>
                    <ProfileForm
                      key={JSON.stringify(data.profile)}
                      profile={data.profile}
                      save={save}
                    />
                  </fieldset>
                </section>
                <section className="panel">
                  <h2>Как считается ориентир</h2>
                  <p>
                    Миффлин—Сан Жеор: 10 × вес + 6,25 × рост − 5 × возраст +{" "}
                    {data.profile.sex === "male" ? "5" : "(−161)"}.
                  </p>
                  <p>
                    BMR: {Math.round(n.bmr)} ккал · TDEE: {Math.round(n.tdee)}{" "}
                    ккал ·{" "}
                    {data.profile.goal === "gain"
                      ? `профицит ${data.profile.surplus} ккал`
                      : "без профицита"}
                    .
                  </p>
                  <p>
                    Белки: {data.profile.proteinPerKg} г/кг. Жиры:{" "}
                    {data.profile.fatPerKg} г/кг. Углеводы — оставшаяся энергия.
                    Значения округлены.
                  </p>
                  <p className="hint">
                    Активность учитывает весь день, а не только тренировки.
                    Калории корректируйте постепенно по среднему весу и
                    самочувствию.
                  </p>
                </section>
                <section className="panel">
                  <h2>Твои данные</h2>
                  <p>
                    {context?.mode === "telegram"
                      ? "Хранятся в Telegram CloudStorage для вашего пользователя и этого бота."
                      : "Хранятся отдельно в локальной демо-базе браузера."}{" "}
                    Сохранение подтверждается Telegram. При ошибке сначала
                    обновите данные.
                  </p>
                  <div className="button-row">
                    <button disabled={busy} onClick={reload}>
                      Обновить данные
                    </button>
                    <button disabled={busy} onClick={exportData}>
                      Экспорт JSON
                    </button>
                  </div>
                  <p className="hint">
                    Без серверного обработчика нет автоответов бота и фоновых
                    напоминаний. Menu button открывает приложение в любой
                    момент.
                  </p>
                </section>
              </>
            )}
            {tab === "Тренировки" && (
              <>
                <div className="segmented" aria-label="Тип тренировки">
                  {(["Push", "Pull", "Legs"] as Day[]).map((d) => (
                    <button
                      key={d}
                      aria-pressed={day === d}
                      onClick={() => {
                        setDay(d);
                        setEditingPlan(false);
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="section-title">
                  <h2>{day} / программа</h2>
                  <button
                    disabled={disabled}
                    className="text-button"
                    onClick={() => setEditingPlan(!editingPlan)}
                  >
                    {editingPlan ? "Закрыть редактор" : "Редактировать"}
                  </button>
                </div>
                {editingPlan ? (
                  <section className="panel">
                    <fieldset disabled={disabled}>
                      <PlanForm
                        key={day}
                        plan={data.plan}
                        day={day}
                        save={save}
                        close={() => setEditingPlan(false)}
                      />
                    </fieldset>
                  </section>
                ) : (
                  data.plan[day].map((e) => (
                    <ExerciseCard key={e.id} exercise={e} />
                  ))
                )}
                <section className="panel">
                  <h2>Записать тренировку</h2>
                  <p className="hint">
                    Укажите фактический вес и повторы каждого подхода. 0 кг —
                    упражнение без внешнего отягощения. Разминочные подходы
                    можно не включать.
                  </p>
                  <fieldset disabled={disabled}>
                    <SessionForm
                      key={`${day}-${sessionVersion}-${JSON.stringify(data.plan[day])}`}
                      plan={data.plan[day]}
                      day={day}
                      previous={data.sessions.map((s) => s.value)}
                      save={save}
                      saved={() => setSessionVersion((v) => v + 1)}
                    />
                  </fieldset>
                </section>
                <p className="hint">
                  PPL — редактируемый шаблон. Чередуйте дни в удобном ритме,
                  оставляя время на восстановление. Повышайте нагрузку при
                  устойчивой технике.
                </p>
              </>
            )}
            {tab === "Прогресс" && (
              <>
                <section className="panel">
                  <h2>Масса тела</h2>
                  <p className="hint">
                    Сравнивайте замеры в сходных условиях. Один замер на дату;
                    повторное сохранение обновляет его. Вес в анкете меняется
                    отдельно.
                  </p>
                  <fieldset disabled={disabled}>
                    <WeightForm save={save} />
                  </fieldset>
                  <WeightChart weights={data.weights} />
                </section>
                <section className="mini-stats">
                  <div>
                    <strong>{data.sessions.length}</strong>
                    <span>тренировок</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round(
                        data.sessions.reduce(
                          (sum, s) => sum + volume(s.value),
                          0,
                        ),
                      ).toLocaleString("ru-RU")}
                    </strong>
                    <span>объём, кг × повторы</span>
                  </div>
                  <div>
                    <strong>{data.weights.length}</strong>
                    <span>замеров массы</span>
                  </div>
                </section>
                <section className="panel">
                  <h2>История тренировок</h2>
                  {data.sessions.length === 0 && (
                    <p className="empty">
                      Здесь появятся ваши тренировки. Первая — хороший старт.
                    </p>
                  )}
                  {data.sessions.map((s) => (
                    <details key={s.key} className="history">
                      <summary>
                        <strong>{s.value.day}</strong>
                        <span>
                          {dateText(s.value.date)} ·{" "}
                          {volume(s.value).toLocaleString("ru-RU")} кг × повт.
                        </span>
                      </summary>
                      {s.value.exercises.map((e, i) => (
                        <p key={i}>
                          <strong>{e.name}</strong>
                          <br />
                          {e.sets
                            .map((a, j) => `${j + 1}: ${a.kg} кг × ${a.reps}`)
                            .join(" · ")}
                        </p>
                      ))}
                      <button
                        className="danger"
                        disabled={disabled}
                        onClick={() => {
                          if (confirm("Удалить эту тренировку из истории?"))
                            void save((r) => r.remove(s.key));
                        }}
                      >
                        Удалить тренировку
                      </button>
                    </details>
                  ))}
                </section>
                {data.weights.length > 0 && (
                  <section className="panel">
                    <h2>Замеры</h2>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Дата</th>
                            <th>Вес</th>
                            <th>Действие</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...data.weights].reverse().map((w) => (
                            <tr key={w.key}>
                              <td>{dateText(w.value.date)}</td>
                              <td>{w.value.kg} кг</td>
                              <td>
                                <button
                                  className="text-button danger"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (confirm("Удалить этот замер?"))
                                      void save((r) => r.remove(w.key));
                                  }}
                                >
                                  Удалить
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
        <footer>
          Рост — это процесс. Дай себе время.
          <br />
          <small>Расчёты ориентировочные · данные под твоим контролем</small>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Главная навигация">
        {tabs.map((t, i) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              setTab(t);
              setNotice("");
            }}
          >
            <span aria-hidden="true">{icons[i]}</span>
            {t}
          </button>
        ))}
      </nav>
    </div>
  );
}
function Macro({
  name,
  amount,
  className,
}: {
  name: string;
  amount: number;
  className: string;
}) {
  return (
    <div className={`macro ${className}`}>
      <i />
      <span>{name}</span>
      <strong>
        {amount}
        <small> г</small>
      </strong>
    </div>
  );
}
function message(e: unknown) {
  if (e instanceof Error && e.name !== "ZodError") return e.message;
  return "Проверьте значения полей и доступность хранилища. Данные не перезаписаны.";
}
function ProfileForm({ profile, save }: { profile: Profile; save: Save }) {
  const [p, setP] = useState(profile);
  const [error, setError] = useState("");
  const update = (k: keyof Profile, v: string) =>
    setP((prev) => ({
      ...prev,
      [k]: ["sex", "goal"].includes(k) ? v : Number(v),
    }));
  let result;
  try {
    result = nutrition(p);
  } catch {
    /* Draft can temporarily be incomplete. */
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      nutrition(p);
      profileSchema.parse(p);
      await save((r) => r.save("fit_v1_profile", p, profileSchema));
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Пол для формулы">
          <select value={p.sex} onChange={(e) => update("sex", e.target.value)}>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
          </select>
        </Field>
        {(
          [
            { key: "age", label: "Возраст, лет", min: 18, max: 90, step: 1 },
            { key: "height", label: "Рост, см", min: 120, max: 230, step: 0.1 },
            { key: "weight", label: "Вес, кг", min: 35, max: 250, step: 0.1 },
          ] as const
        ).map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              required
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={p[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Общая активность">
          <select
            value={p.activity}
            onChange={(e) => update("activity", e.target.value)}
          >
            <option value="1.2">Малоподвижный день · 1,2</option>
            <option value="1.375">Лёгкая активность · 1,375</option>
            <option value="1.55">Умеренная, 3–5 тренировок · 1,55</option>
            <option value="1.725">Высокая активность · 1,725</option>
            <option value="1.9">Очень высокая активность · 1,9</option>
          </select>
        </Field>
        <Field label="Цель">
          <select
            value={p.goal}
            onChange={(e) => update("goal", e.target.value)}
          >
            <option value="gain">Набор массы</option>
            <option value="maintain">Поддержание</option>
          </select>
        </Field>
        {(
          [
            {
              key: "surplus",
              label: "Профицит, ккал",
              min: 0,
              max: 600,
              step: 1,
            },
            {
              key: "proteinPerKg",
              label: "Белок, г/кг",
              min: 1.2,
              max: 2.5,
              step: 0.1,
            },
            {
              key: "fatPerKg",
              label: "Жиры, г/кг",
              min: 0.6,
              max: 1.5,
              step: 0.1,
            },
          ] as const
        ).map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              required
              type="number"
              disabled={f.key === "surplus" && p.goal === "maintain"}
              min={f.min}
              max={f.max}
              step={f.step}
              value={p[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
            />
          </Field>
        ))}
      </div>
      {result && (
        <p className="preview">
          {result.calories} ккал · Б {result.protein} / Ж {result.fat} / У{" "}
          {result.carbs}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit">Сохранить профиль</button>
    </form>
  );
}
function PlanForm({
  plan,
  day,
  save,
  close,
}: {
  plan: Plan;
  day: Day;
  save: Save;
  close: () => void;
}) {
  const [list, setList] = useState<Exercise[]>(structuredClone(plan[day]));
  const [error, setError] = useState("");
  const update = (i: number, patch: Partial<Exercise>) =>
    setList((old) => old.map((e, j) => (i === j ? { ...e, ...patch } : e)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const next = planSchema.parse({ ...plan, [day]: list });
      if (await save((r) => r.save("fit_v1_plan", next, planSchema))) close();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <form onSubmit={submit}>
      {list.map((e, i) => (
        <div className="plan-row" key={e.id}>
          <Field label={`Упражнение ${i + 1}`}>
            <input
              required
              maxLength={70}
              value={e.name}
              onChange={(v) => update(i, { name: v.target.value })}
            />
          </Field>
          <div className="form-grid">
            <Field label="Мышцы">
              <select
                value={e.muscle}
                onChange={(v) =>
                  update(i, { muscle: v.target.value as Muscle })
                }
              >
                {Object.entries(muscles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Подходы">
              <input
                required
                type="number"
                min={1}
                max={8}
                value={e.sets}
                onChange={(v) => update(i, { sets: Number(v.target.value) })}
              />
            </Field>
            <Field label="Повторы">
              <input
                required
                type="number"
                min={1}
                max={30}
                value={e.reps}
                onChange={(v) => update(i, { reps: Number(v.target.value) })}
              />
            </Field>
            <Field label="Подсказка">
              <input
                maxLength={180}
                value={e.cue}
                onChange={(v) => update(i, { cue: v.target.value })}
              />
            </Field>
          </div>
          <button
            type="button"
            className="text-button danger"
            disabled={list.length <= 1}
            onClick={() => setList((old) => old.filter((_, j) => j !== i))}
          >
            Убрать из программы
          </button>
        </div>
      ))}
      <div className="button-row">
        <button
          type="button"
          disabled={list.length >= 8}
          onClick={() =>
            setList((old) => [
              ...old,
              {
                id: crypto.randomUUID(),
                name: "Новое упражнение",
                muscle: "chest",
                sets: 3,
                reps: 10,
                cue: "",
              },
            ])
          }
        >
          + Упражнение
        </button>
        <button type="submit">Сохранить программу</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function SessionForm({
  plan,
  day,
  previous,
  save,
  saved,
}: {
  plan: Exercise[];
  day: Day;
  previous: Session[];
  save: Save;
  saved: () => void;
}) {
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const [exercises, setExercises] = useState(() =>
    plan.map((e) => {
      const last = previous
        .flatMap((s) => s.exercises)
        .find((x) => x.name === e.name);
      return {
        name: e.name,
        muscle: e.muscle,
        sets: Array.from({ length: e.sets }, (_, i) => ({
          kg: last?.sets[i]?.kg ?? 0,
          reps: e.reps,
        })),
      };
    }),
  );
  // Stable id lets a retry overwrite the same session if an earlier callback timed out.
  const [key] = useState(() => `fit_v1_session_${crypto.randomUUID()}`);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const s = sessionSchema.parse({ date, day, exercises });
      if (await save((r) => r.save(key, s, sessionSchema))) saved();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Дата тренировки">
        <input
          required
          type="date"
          max={today()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      {exercises.map((e, i) => (
        <div className="session-exercise" key={i}>
          <h3>{e.name}</h3>
          <div className="set-heading">
            <span>Подход</span>
            <span>Вес, кг</span>
            <span>Повторы</span>
          </div>
          {e.sets.map((s, j) => (
            <div className="set-row" key={j}>
              <span>{String(j + 1).padStart(2, "0")}</span>
              {(["kg", "reps"] as const).map((k) => (
                <input
                  key={k}
                  aria-label={`${e.name}, подход ${j + 1}, ${k === "kg" ? "вес" : "повторы"}`}
                  type="number"
                  required
                  min={k === "kg" ? 0 : 1}
                  max={k === "kg" ? 500 : 100}
                  step={k === "kg" ? 0.5 : 1}
                  value={s[k]}
                  onChange={(v) =>
                    setExercises((old) =>
                      old.map((x, a) =>
                        a !== i
                          ? x
                          : {
                              ...x,
                              sets: x.sets.map((t, b) =>
                                b !== j
                                  ? t
                                  : { ...t, [k]: Number(v.target.value) },
                              ),
                            },
                      ),
                    )
                  }
                />
              ))}
            </div>
          ))}
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="wide">
        Сохранить тренировку ✓
      </button>
    </form>
  );
}
function WeightForm({ save }: { save: Save }) {
  const [date, setDate] = useState(today());
  const [kg, setKg] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const w = weightSchema.parse({ date, kg: Number(kg) });
      if (await save((r) => r.save(`fit_v1_weight_${date}`, w, weightSchema)))
        setKg("");
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <form className="weight-form" onSubmit={submit}>
      <Field label="Дата замера">
        <input
          required
          type="date"
          max={today()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field label="Масса, кг">
        <input
          required
          placeholder="80,0"
          type="number"
          min={35}
          max={250}
          step={0.1}
          value={kg}
          onChange={(e) => setKg(e.target.value)}
        />
      </Field>
      <button type="submit">Сохранить замер</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function WeightChart({ weights }: { weights: Data["weights"] }) {
  if (!weights.length)
    return (
      <p className="empty">
        Добавьте первый замер — начнём отслеживать динамику.
      </p>
    );
  const values = weights.map((w) => w.value.kg),
    min = Math.min(...values) - 1,
    max = Math.max(...values) + 1;
  const dates = weights.map((w) => Date.parse(w.value.date)),
    start = dates[0],
    end = dates.at(-1)!;
  const points = values.map((v, i) => ({
    x: end === start ? 160 : 30 + ((dates[i] - start) / (end - start)) * 260,
    y: 150 - ((v - min) / (max - min)) * 120,
  }));
  return (
    <div className="chart">
      <svg
        viewBox="0 0 320 195"
        role="img"
        aria-label={`График массы: ${values[0]} — ${values.at(-1)} кг. Все замеры в таблице ниже.`}
      >
        <line x1="30" y1="150" x2="290" y2="150" className="grid-line" />
        <line x1="30" y1="90" x2="290" y2="90" className="grid-line" />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          className="chart-line"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" className="chart-point">
            <title>
              {weights[i].value.date}: {values[i]} кг
            </title>
          </circle>
        ))}
        <text x="30" y="178">
          {weights[0].value.date}
        </text>
        <text x="290" y="178" textAnchor="end">
          {weights.at(-1)!.value.date}
        </text>
        <text x="30" y="20">
          {max.toFixed(1)} кг
        </text>
      </svg>
    </div>
  );
}
