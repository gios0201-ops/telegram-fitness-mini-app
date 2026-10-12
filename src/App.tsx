import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  muscles,
  nutrition,
  planSchema,
  profileSchema,
  today,
  volume,
  weightSchema,
  type Data,
  type Day,
  type Exercise,
  type Muscle,
  type Plan,
  type Profile,
} from "./domain";
import {
  createRepository,
  haptic,
  initTelegram,
  telegramBack,
} from "./telegram";
import { NutritionDiary } from "./NutritionDiary";
import { ExerciseScreen, MuscleDiagram, type Draft } from "./ExerciseScreen";
import { catalog, ranges, defaultPlan, exerciseGroup } from "./catalog";
import { archivedExercises, analysis, scheduleSchema } from "./journal";
import { Repository } from "./storage";
type Tab = "Сегодня" | "Тренировки" | "Прогресс" | "Профиль" | "Питание";
type Save = (action: (repo: Repository) => Promise<void>) => Promise<boolean>;
const tabs: Tab[] = ["Сегодня", "Тренировки", "Питание", "Прогресс", "Профиль"];
const icons = [
  "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  "M6 4v16M3 7v10M18 4v16M21 7v10M6 12h12",
  "M5 3v7m3-7v7m-6-7v7h6M5 10v11M17 3v18m0-18c5 3 5 8 0 9",
  "M3 20h18M5 16l5-6 4 3 6-9",
  "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3",
];
function NavIcon({ index }: { index: number }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[index]} />
    </svg>
  );
}
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
export function App() {
  const [context, setContext] = useState<{
    repo: Repository;
    mode: "telegram" | "demo";
  }>();
  const [data, setData] = useState<Data>();
  const [tab, setTab] = useState<Tab>("Сегодня");
  const [day, setDay] = useState<Day>("Push");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<Plan>();
  const [weightFormOpen, setWeightFormOpen] = useState(false);
  const [period, setPeriod] = useState(30);
  const [catalogQuery, setCatalogQuery] = useState("");
  useEffect(
    () =>
      tab === "Прогресс" && weightFormOpen
        ? telegramBack(() => setWeightFormOpen(false))
        : undefined,
    [tab, weightFormOpen],
  );
  useEffect(() => {
    const viewport = window.visualViewport;
    const initialHeight = viewport?.height ?? innerHeight;
    const resize = () =>
      document.body.classList.toggle(
        "keyboard-open",
        (viewport?.height ?? innerHeight) < initialHeight - 120,
      );
    viewport?.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      document.body.classList.remove("keyboard-open");
    };
  }, []);
  const [selected, setSelected] = useState<Exercise>();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const closeExercise = () => {
    setSelected(undefined);
    setTab("Тренировки");
  };
  useEffect(() => {
    const pop = () => closeExercise();
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const back = () => {
    if (history.state?.fitnessExercise) history.back();
    else closeExercise();
  };
  const openExercise = (exercise: Exercise) => {
    setSelected(exercise);
    history.pushState({ fitnessExercise: exercise.id }, "");
    window.scrollTo(0, 0);
  };
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
    if (!context || busy || blocked || saving.current) return false;
    saving.current = true;
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
      saving.current = false;
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
    <div className={`app-shell${selected ? " exercise-open" : ""}`}>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Сегодня");
          }}
        >
          <span className="brand-icon">
            <NavIcon index={3} />
          </span>
          рост
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
            <h1>
              {tab === "Сегодня"
                ? "Становись сильнее"
                : tab === "Тренировки"
                  ? "Мой тренировочный план"
                  : tab}
            </h1>
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
            {selected ? (
              <ExerciseScreen
                key={selected.id}
                exercise={
                  Object.values(data.plan)
                    .flat()
                    .find((e) => e.id === selected.id) ?? selected
                }
                day={day}
                data={data}
                save={save}
                disabled={disabled}
                back={back}
                draft={
                  drafts[selected.id] ?? {
                    kg: "",
                    reps: String(selected.repsMin ?? selected.reps),
                    note: "",
                    date: today(),
                  }
                }
                changeDraft={(draft) =>
                  setDrafts((old) => ({ ...old, [selected.id]: draft }))
                }
              />
            ) : (
              <>
                {tab === "Сегодня" && (
                  <>
                    <section className="hero">
                      <div>
                        <p className="eyebrow">ПЛАН НА ДЕНЬ</p>
                        <h2>
                          Твой следующий шаг.
                          <br />
                        </h2>
                        <p>
                          Тренируйся, восстанавливайся и наблюдай за прогрессом.
                        </p>
                        <button
                          onClick={() => {
                            setDay(
                              data.schedule?.[(new Date().getDay() + 6) % 7] ??
                                day,
                            );
                            setTab("Тренировки");
                          }}
                        >
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
                        <Macro
                          name="Углеводы"
                          amount={n.carbs}
                          className="carbs"
                        />
                      </div>
                    </div>
                    <p className="hint">
                      Это стартовая оценка, а не точная потребность. Сверяйте её
                      с динамикой веса за 2–3 недели. Частоту приёмов пищи
                      выбирайте сами.
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
                          <span>{data.plan[d].length} упражнений</span>
                        </button>
                      ))}
                    </div>
                    <section className="mini-stats">
                      <div>
                        <strong>
                          {
                            new Set(
                              (data.journal ?? []).map((s) => s.workoutId),
                            ).size
                          }
                        </strong>
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
                {tab === "Питание" && (
                  <NutritionDiary
                    data={data}
                    save={save}
                    disabled={busy || blocked}
                  />
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
                        BMR: {Math.round(n.bmr)} ккал · TDEE:{" "}
                        {Math.round(n.tdee)} ккал ·{" "}
                        {data.profile.goal === "gain"
                          ? `профицит ${data.profile.surplus} ккал`
                          : "без профицита"}
                        .
                      </p>
                      <p>
                        Белки: {data.profile.proteinPerKg} г/кг. Жиры:{" "}
                        {data.profile.fatPerKg} г/кг. Углеводы — оставшаяся
                        энергия. Значения округлены.
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
                        Без серверного обработчика нет автоответов бота и
                        фоновых напоминаний. Menu button открывает приложение в
                        любой момент.
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
                      <h2>{data.plan[day].length} упражнений</h2>
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
                      <div className="exercise-list">
                        {[
                          ...new Set(
                            data.plan[day].map((e) => exerciseGroup(day, e)),
                          ),
                        ].map((group) => (
                          <section className="muscle-group" key={group}>
                            <h3>{group}</h3>
                            {data.plan[day]
                              .filter((e) => exerciseGroup(day, e) === group)
                              .map((e) => (
                                <button
                                  className="exercise-tile"
                                  key={e.id}
                                  onClick={() => openExercise(e)}
                                >
                                  <MuscleDiagram exercise={e} small />
                                  <span>
                                    <strong>{e.name}</strong>
                                    <span>
                                      {group} · {ranges(e)}
                                    </span>
                                    <small>
                                      Сегодня:{" "}
                                      {
                                        (data.journal ?? []).filter(
                                          (s) =>
                                            s.exerciseId === e.id &&
                                            s.date === today(),
                                        ).length
                                      }{" "}
                                      подходов
                                    </small>
                                  </span>
                                  <span aria-hidden="true">›</span>
                                </button>
                              ))}
                          </section>
                        ))}
                      </div>
                    )}
                    <button
                      className="install-plan"
                      disabled={disabled}
                      onClick={() => setPreviewPlan(structuredClone(data.plan))}
                    >
                      Установить полный PPL-план
                    </button>
                    {previewPlan && (
                      <section
                        className="panel plan-preview"
                        aria-label="Предварительный просмотр PPL"
                      >
                        <h2>Полный PPL · 23 упражнения</h2>
                        <p>
                          Старая программа сохранится в резервной копии. История
                          подходов, питание и замеры останутся.
                        </p>
                        {(["Push", "Pull", "Legs"] as const).map((d) => (
                          <details key={d} open>
                            <summary>
                              {d.toUpperCase()} · {defaultPlan()[d].length}{" "}
                              упражнений
                            </summary>
                            {defaultPlan()[d].map((e) => (
                              <p key={e.id}>
                                <strong>{e.name}</strong>
                                <br />
                                {exerciseGroup(d, e)} · {ranges(e)}
                              </p>
                            ))}
                          </details>
                        ))}
                        <button
                          className="primary"
                          disabled={disabled}
                          onClick={async () => {
                            if (
                              await save((r) => r.installFullPlan(previewPlan))
                            )
                              setPreviewPlan(undefined);
                          }}
                        >
                          Подтвердить установку полного плана
                        </button>
                        <button
                          disabled={disabled}
                          onClick={() => setPreviewPlan(undefined)}
                        >
                          Отмена установки
                        </button>
                      </section>
                    )}
                    <details className="panel">
                      <summary>Каталог упражнений</summary>
                      <label className="field">
                        Поиск упражнения
                        <input
                          type="search"
                          value={catalogQuery}
                          onChange={(e) => setCatalogQuery(e.target.value)}
                        />
                      </label>
                      {catalog[day]
                        .filter((e) =>
                          e.name
                            .toLowerCase()
                            .includes(catalogQuery.toLowerCase()),
                        )
                        .map((e) => (
                          <button
                            className="catalog-tile"
                            key={e.id}
                            onClick={() => openExercise(e)}
                          >
                            <MuscleDiagram exercise={e} small />
                            <span>
                              <strong>{e.name}</strong>
                              <span>
                                {muscles[e.muscle]} · {ranges(e)}
                              </span>
                            </span>
                          </button>
                        ))}
                    </details>
                    <ScheduleForm
                      key={JSON.stringify(data.schedule)}
                      schedule={data.schedule!}
                      save={save}
                      disabled={disabled}
                    />
                    {archivedExercises(data).length > 0 && (
                      <section className="panel">
                        <h2>Архив упражнений</h2>
                        <p>
                          Неоднозначные старые записи и упражнения, убранные из
                          программы. История сохранена.
                        </p>
                        {archivedExercises(data).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => {
                              setDay(e.day);
                              openExercise(e);
                            }}
                          >
                            {e.name} · {e.day}
                          </button>
                        ))}
                      </section>
                    )}
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
                      {weightFormOpen ? (
                        <>
                          <button onClick={() => setWeightFormOpen(false)}>
                            Назад к прогрессу
                          </button>
                          <h2>Новый замер</h2>
                          <fieldset disabled={disabled}>
                            <WeightForm
                              save={save}
                              onSaved={() => setWeightFormOpen(false)}
                            />
                          </fieldset>
                        </>
                      ) : (
                        <>
                          <div className="section-title">
                            <h2>Масса тела</h2>
                            <select
                              aria-label="Период прогресса"
                              value={period}
                              onChange={(e) =>
                                setPeriod(Number(e.target.value))
                              }
                            >
                              <option value={7}>7 дней</option>
                              <option value={30}>30 дней</option>
                              <option value={90}>90 дней</option>
                              <option value={99999}>Всё время</option>
                            </select>
                          </div>
                          <div className="weight-summary">
                            <strong>
                              {data.weights.at(-1)?.value.kg ?? "—"}{" "}
                              <small>кг</small>
                            </strong>
                            <span>
                              {(() => {
                                const cutoff = new Date();
                                cutoff.setDate(cutoff.getDate() - period);
                                const list = data.weights.filter(
                                  (w) =>
                                    w.value.date >=
                                    cutoff.toISOString().slice(0, 10),
                                );
                                return list.length > 1
                                  ? `${(list.at(-1)!.value.kg - list[0].value.kg).toFixed(1)} кг за период`
                                  : "Недостаточно замеров для сравнения";
                              })()}
                            </span>
                          </div>
                          <WeightChart
                            weights={data.weights.filter((w) => {
                              const cutoff = new Date();
                              cutoff.setDate(cutoff.getDate() - period);
                              return (
                                w.value.date >=
                                cutoff.toISOString().slice(0, 10)
                              );
                            })}
                          />
                          <button
                            className="primary"
                            disabled={disabled}
                            onClick={() => setWeightFormOpen(true)}
                          >
                            Добавить замер
                          </button>
                        </>
                      )}
                    </section>
                    <section className="mini-stats">
                      <div>
                        <strong>
                          {
                            new Set(
                              (data.journal ?? []).map((s) => s.workoutId),
                            ).size
                          }
                        </strong>
                        <span>тренировок</span>
                      </div>
                      <div>
                        <strong>
                          {Math.round(
                            analysis(data.journal ?? []).volume,
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
                      {[
                        ...new Set(
                          (data.journal ?? []).map((s) => s.workoutId),
                        ),
                      ].map((id) => {
                        const sets = (data.journal ?? []).filter(
                          (s) => s.workoutId === id,
                        );
                        return (
                          <details className="history" key={id}>
                            <summary>
                              <strong>{sets[0].day}</strong>
                              <span>
                                {dateText(sets[0].date)} ·{" "}
                                {analysis(sets).volume} кг × повт.
                              </span>
                            </summary>
                            {sets.map((s) => (
                              <p key={s.id}>
                                {s.name}: {s.kg} кг × {s.reps}
                                {s.note ? ` · ${s.note}` : ""}
                              </p>
                            ))}
                          </details>
                        );
                      })}
                      {data.sessions.length > 0 && (
                        <h3>Исходные тренировки v1 (архив)</h3>
                      )}
                      {(data.journal ?? []).length === 0 && (
                        <p className="empty">
                          Здесь появятся ваши тренировки. Первая — хороший
                          старт.
                        </p>
                      )}
                      {data.sessions.map((s) => (
                        <details key={s.key} className="history">
                          <summary>
                            <strong>{s.value.day}</strong>
                            <span>
                              {dateText(s.value.date)} ·{" "}
                              {volume(s.value).toLocaleString("ru-RU")} кг ×
                              повт.
                            </span>
                          </summary>
                          {s.value.exercises.map((e, i) => (
                            <p key={i}>
                              <strong>{e.name}</strong>
                              <br />
                              {e.sets
                                .map(
                                  (a, j) => `${j + 1}: ${a.kg} кг × ${a.reps}`,
                                )
                                .join(" · ")}
                            </p>
                          ))}
                          <small>
                            Исходная запись сохранена. Исправляйте отдельные
                            подходы на экране упражнения.
                          </small>
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
          </>
        )}
        <footer>
          <small>Расчёты ориентировочные · данные под твоим контролем</small>
          <br />
          <small>Версия: {__BUILD_COMMIT__.slice(0, 12)}</small>
        </footer>
      </main>
      {!selected && (
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
              <NavIcon index={i} />
              {t}
            </button>
          ))}
        </nav>
      )}
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
  const [catalogId, setCatalogId] = useState("");
  const update = (i: number, patch: Partial<Exercise>) =>
    setList((old) => old.map((e, j) => (i === j ? { ...e, ...patch } : e)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const next = planSchema.parse({ ...plan, [day]: list });
      const exercises = next[day].map((e) => {
        const old = plan[day].find((p) => p.id === e.id);
        return old && old.name !== e.name
          ? {
              ...e,
              legacyNames: [...new Set([...(old.legacyNames ?? []), old.name])],
            }
          : e;
      });
      if (await save((r) => r.savePlan(day, exercises))) close();
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
                onChange={(v) =>
                  update(i, {
                    sets: Number(v.target.value),
                    setsMin: undefined,
                  })
                }
              />
            </Field>
            <Field label="Повторы">
              <input
                required
                type="number"
                min={1}
                max={30}
                value={e.reps}
                onChange={(v) =>
                  update(i, {
                    reps: Number(v.target.value),
                    repsMin: undefined,
                  })
                }
              />
            </Field>
            <Field label="Минимум подходов (необязательно)">
              <input
                type="number"
                min={1}
                max={e.sets}
                value={e.setsMin ?? ""}
                onChange={(v) =>
                  update(i, {
                    setsMin: v.target.value
                      ? Number(v.target.value)
                      : undefined,
                  })
                }
              />
            </Field>
            <Field label="Минимум повторов (необязательно)">
              <input
                type="number"
                min={1}
                max={e.reps}
                value={e.repsMin ?? ""}
                onChange={(v) =>
                  update(i, {
                    repsMin: v.target.value
                      ? Number(v.target.value)
                      : undefined,
                  })
                }
              />
            </Field>
            <Field label="Комментарий к повторам">
              <input
                maxLength={80}
                value={e.repNote ?? ""}
                onChange={(v) =>
                  update(i, { repNote: v.target.value || undefined })
                }
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
      <label className="field">
        Добавить из каталога
        <select
          aria-label="Добавить из каталога"
          value={catalogId}
          onChange={(e) => setCatalogId(e.target.value)}
        >
          <option value="">Выберите упражнение</option>
          {catalog[day]
            .filter(
              (e) =>
                !list.some((p) => p.id === e.id) &&
                !Object.values(plan)
                  .flat()
                  .some((p) => p.id === e.id && !plan[day].includes(p)),
            )
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!catalogId || list.length >= 8}
        onClick={() => {
          const e = catalog[day].find((e) => e.id === catalogId);
          if (e) {
            const { secondary, errors, aliases, media, ...exercise } = e;
            setList((old) => [...old, exercise]);
            setCatalogId("");
          }
        }}
      >
        Добавить выбранное упражнение
      </button>
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
function WeightForm({ save, onSaved }: { save: Save; onSaved: () => void }) {
  const [date, setDate] = useState(today());
  const [kg, setKg] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const w = weightSchema.parse({ date, kg: Number(kg) });
      if (await save((r) => r.save(`fit_v1_weight_${date}`, w, weightSchema))) {
        setKg("");
        onSaved();
      }
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

function ScheduleForm({
  schedule,
  save,
  disabled,
}: {
  schedule: (Day | null)[];
  save: Save;
  disabled: boolean;
}) {
  const [value, setValue] = useState(schedule);
  return (
    <details className="panel">
      <summary>Расписание недели</summary>
      <p>
        Сегодня:{" "}
        {schedule[(new Date().getDay() + 6) % 7] ?? "Отдых / лёгкая активность"}
        . День программы можно выбрать вручную независимо от календаря.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await save((r) => r.save("fit_v2_schedule", value, scheduleSchema));
        }}
      >
        <fieldset disabled={disabled}>
          {[
            "Понедельник",
            "Вторник",
            "Среда",
            "Четверг",
            "Пятница",
            "Суббота",
            "Воскресенье",
          ].map((name, i) => (
            <Field key={name} label={name}>
              <select
                aria-label={name}
                value={value[i] ?? ""}
                onChange={(e) =>
                  setValue((old) =>
                    old.map((v, j) =>
                      i === j ? (e.target.value as Day) || null : v,
                    ),
                  )
                }
              >
                <option value="">Отдых / лёгкая активность</option>
                {["Push", "Pull", "Legs"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
          ))}
          <button type="submit">Сохранить расписание</button>
        </fieldset>
      </form>
    </details>
  );
}
