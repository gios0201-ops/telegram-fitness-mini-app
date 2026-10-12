import { z } from "zod";
import {
  dateSchema,
  muscles,
  setSchema,
  type Data,
  type Day,
  type Exercise,
} from "./domain";
import { catalogById } from "./catalog";
export const journalSetSchema = setSchema.extend({
  id: z.string().min(1).max(160),
  exerciseId: z.string().min(1).max(160),
  name: z.string().min(1).max(70),
  muscle: z.enum(["chest", "back", "shoulders", "arms", "legs"]),
  date: dateSchema,
  day: z.enum(["Push", "Pull", "Legs"]),
  workoutId: z.string().min(1).max(160),
  note: z.string().max(200),
  createdAt: z.string().datetime(),
});
export type SetValue = z.infer<typeof journalSetSchema>;
export const eventSchema = z
  .object({
    id: z.string().uuid(),
    target: z.string().min(1).max(160),
    parents: z.array(z.string().min(1).max(160)).max(50),
    value: journalSetSchema.nullable(),
  })
  .refine(
    (e) =>
      !e.parents.includes(e.id) && new Set(e.parents).size === e.parents.length,
    "Повторный или циклический родитель записи",
  )
  .refine(
    (e) => !e.value || e.target === e.value.id,
    "ID подхода не совпадает",
  );
export type JournalEvent = z.infer<typeof eventSchema>;
export const journalPageSchema = z.object({
  date: dateSchema,
  events: z.array(eventSchema).min(1).max(50),
});
export const scheduleSchema = z
  .array(z.enum(["Push", "Pull", "Legs"]).nullable())
  .length(7);
export const defaultSchedule: (Day | null)[] = [
  "Push",
  null,
  "Pull",
  null,
  "Legs",
  null,
  null,
];
export type JournalSet = SetValue & { revision: string };
export type JournalConflict = {
  target: string;
  exerciseId?: string;
  name?: string;
  muscle?: SetValue["muscle"];
  day?: Day;
  heads: { revision: string; value: SetValue | null }[];
};
export function legacySets(data: Data): JournalSet[] {
  return data.sessions.flatMap((session) =>
    session.value.exercises.flatMap((e, i) => {
      const candidates = (data.legacyPlan ?? data.plan)[
        session.value.day
      ].filter(
        (p) =>
          p.name === e.name ||
          p.legacyNames?.includes(e.name) ||
          catalogById[p.id]?.aliases.includes(e.name),
      );
      const exerciseId =
        candidates.length === 1
          ? candidates[0].id
          : `archive_${session.key}_${i}`;
      return e.sets.map((set, j) => {
        const id = `legacy_${session.key}_${i}_${j}`;
        return {
          ...set,
          id,
          exerciseId,
          name: e.name,
          muscle: e.muscle,
          date: session.value.date,
          day: session.value.day,
          workoutId: session.key,
          note: "",
          createdAt: `${session.value.date}T12:00:00.000Z`,
          revision: id,
        };
      });
    }),
  );
}
export function projectJournal(data: Data, events: JournalEvent[]) {
  const nodes = new Map<
    string,
    Map<string, { revision: string; value: SetValue | null }>
  >();
  const consumed = new Set<string>();
  const byTarget = new Map<string, JournalEvent[]>();
  for (const s of legacySets(data)) {
    const { revision, ...value } = s;
    nodes.set(s.id, new Map([[revision, { revision, value }]]));
  }
  const seen = new Map<string, string>();
  for (const event of events) {
    const serialized = JSON.stringify(event);
    if (seen.has(event.id)) {
      if (seen.get(event.id) !== serialized)
        throw new Error("Конфликт повторного ID записи. Экспортируйте данные.");
      continue;
    }
    seen.set(event.id, serialized);
    byTarget.set(event.target, [...(byTarget.get(event.target) ?? []), event]);
    const group = nodes.get(event.target) ?? new Map();
    group.set(event.id, { revision: event.id, value: event.value });
    nodes.set(event.target, group);
    for (const parent of event.parents)
      consumed.add(`${event.target}:${parent}`);
  }
  const sets: JournalSet[] = [],
    conflicts: JournalConflict[] = [];
  for (const [target, group] of nodes) {
    // Every parent must exist in this same set's history; never silently discard a broken chain.
    for (const event of byTarget.get(target) ?? [])
      for (const parent of event.parents)
        if (!group.has(parent))
          throw new Error(
            "Неполная история подхода. Данные не перезаписаны; экспортируйте их.",
          );
    const heads = [...group.values()].filter(
      (n) => !consumed.has(`${target}:${n.revision}`),
    );
    if (!heads.length)
      throw new Error("Циклическая история подхода. Экспортируйте данные.");
    if (heads.length > 1) {
      const source = [...group.values()].find((h) => h.value)?.value;
      conflicts.push({
        target,
        heads,
        exerciseId: source?.exerciseId,
        name: source?.name,
        muscle: source?.muscle,
        day: source?.day,
      });
    } else if (heads[0]?.value)
      sets.push({ ...heads[0].value, revision: heads[0].revision });
  }
  sets.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  return { sets, conflicts };
}
export function analysis(sets: JournalSet[]) {
  const ordered = [...sets].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  return {
    count: sets.length,
    bestKg: Math.max(0, ...sets.map((s) => s.kg)),
    volume: sets.reduce((n, s) => n + s.kg * s.reps, 0),
    reps: sets.reduce((n, s) => n + s.reps, 0),
    last: ordered[0],
    bestVolume: Math.max(0, ...sets.map((s) => s.kg * s.reps)),
  };
}
export function archivedExercises(data: Data): (Exercise & { day: Day })[] {
  const known = new Set(
    Object.values(data.plan)
      .flat()
      .map((e) => e.id),
  );
  const result = new Map<string, Exercise & { day: Day }>();
  for (const set of data.journal ?? [])
    if (!known.has(set.exerciseId))
      result.set(set.exerciseId, {
        id: set.exerciseId,
        name: set.name,
        muscle: set.muscle,
        sets: 3,
        reps: 10,
        cue: `Архив: ${muscles[set.muscle]}. Связь с программой не определена автоматически.`,
        day: set.day,
      });
  for (const c of data.conflicts ?? [])
    if (c.exerciseId && c.day && !known.has(c.exerciseId))
      result.set(c.exerciseId, {
        id: c.exerciseId,
        name: c.name ?? "Конфликт архива",
        muscle: c.muscle ?? "chest",
        sets: 3,
        reps: 10,
        cue: "Разрешите конфликт изменений.",
        day: c.day,
      });
  return [...result.values()];
}
