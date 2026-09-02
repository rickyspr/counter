// Passmallar: en ren LOKAL funktion i mobilen. En mall är namn + en
// ordnad lista övningar, och per övning en ordnad lista set-rader med
// valfria reps/vikt. Vikt ALLTID i kg, precis som allt annat som lagras.
//
// Lagras i AsyncStorage under en nyckel per användare (mönstret från
// unit-context.ts), inte i en tabell och inte i synk-kön. Det betyder
// att mallar försvinner vid telefonbyte eller ominstallation - ett
// accepterat vägval. Kan flyttas till en tabell senare.
//
// Att starta ett pass från en mall bygger exakt den ActiveWorkout-blob
// som ActiveWorkoutScreen redan läser vid hydrering (se
// buildActiveWorkoutFromTemplate), så passflödet får ingen ny kodväg.

import * as Crypto from "expo-crypto";
import { weightInputValue, type Unit } from "@counter/shared";
import type { ActiveWorkout, PersistedSection } from "./active-workout";
import type { ExerciseOption } from "./queries";
import { newSetId, newWorkoutExerciseId } from "./queries";
import { readJSON, writeJSON } from "./storage";

export interface TemplateSet {
  reps: number | null;
  weightKg: number | null; // ALLTID kg
}

export interface TemplateExercise {
  exerciseId: string; // riktig exercises.id (aldrig ett "default:N"-id)
  exerciseName: string;
  sets: TemplateSet[];
}

export interface WorkoutTemplate {
  version: 1;
  id: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_PREFIX = "counter:workout-templates:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function newTemplateId(): string {
  return Crypto.randomUUID();
}

// readJSON gör en ovaliderad `as T`-cast, så allt som kommer från disk
// måste kontrolleras här - samma anda som parseStored i active-workout.ts.
// En ogiltig post släpps, resten behålls. version bumpas ALDRIG för
// additiva fält.
function isTemplateSet(raw: unknown): raw is TemplateSet {
  if (!raw || typeof raw !== "object") return false;
  const set = raw as Record<string, unknown>;
  if (set.reps !== null && typeof set.reps !== "number") return false;
  if (set.weightKg !== null && typeof set.weightKg !== "number") return false;
  return true;
}

function isTemplateExercise(raw: unknown): raw is TemplateExercise {
  if (!raw || typeof raw !== "object") return false;
  const exercise = raw as Record<string, unknown>;
  if (typeof exercise.exerciseId !== "string") return false;
  if (typeof exercise.exerciseName !== "string") return false;
  if (!Array.isArray(exercise.sets)) return false;
  return exercise.sets.every(isTemplateSet);
}

function parseTemplate(raw: unknown): WorkoutTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.name !== "string") return null;
  if (!Array.isArray(value.exercises)) return null;
  if (!value.exercises.every(isTemplateExercise)) return null;
  const now = new Date().toISOString();
  return {
    version: 1,
    id: value.id,
    name: value.name,
    exercises: value.exercises as TemplateExercise[],
    createdAt:
      typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
}

async function readTemplates(userId: string): Promise<WorkoutTemplate[]> {
  try {
    const raw = await readJSON<unknown>(storageKey(userId), null);
    if (!Array.isArray(raw)) return [];
    const parsed: WorkoutTemplate[] = [];
    for (const entry of raw) {
      const template = parseTemplate(entry);
      if (template !== null) parsed.push(template);
    }
    return parsed;
  } catch {
    return [];
  }
}

// Sorterad alfabetiskt på namn.
export async function loadTemplates(
  userId: string,
): Promise<WorkoutTemplate[]> {
  const templates = await readTemplates(userId);
  return templates.sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

// Upsert på id. Sätter updatedAt.
export async function saveTemplate(
  userId: string,
  template: WorkoutTemplate,
): Promise<void> {
  const templates = await readTemplates(userId);
  const next = { ...template, updatedAt: new Date().toISOString() };
  const withoutExisting = templates.filter((t) => t.id !== template.id);
  await writeJSON(storageKey(userId), [...withoutExisting, next]);
}

export async function deleteTemplate(
  userId: string,
  templateId: string,
): Promise<void> {
  const templates = await readTemplates(userId);
  await writeJSON(
    storageKey(userId),
    templates.filter((t) => t.id !== templateId),
  );
}

// "Mall N", minsta lediga N >= 1. Skiftlägesokänslig jämförelse mot
// trimmade namn.
export function defaultTemplateName(existing: WorkoutTemplate[]): string {
  const taken = new Set(
    existing.map((t) => t.name.trim().toLowerCase()),
  );
  let n = 1;
  while (taken.has(`mall ${n}`)) n += 1;
  return `Mall ${n}`;
}

// "4 övningar · 14 set".
export function describeTemplate(template: WorkoutTemplate): string {
  const exerciseCount = template.exercises.length;
  const setCount = template.exercises.reduce(
    (total, exercise) => total + exercise.sets.length,
    0,
  );
  return [
    `${exerciseCount} ${exerciseCount === 1 ? "övning" : "övningar"}`,
    `${setCount} set`,
  ].join(" · ");
}

// Löser upp mallens övningar mot den aktuella katalogen. Om katalogen är
// tom ELLER innehåller någon fallback-post är den inte trovärdig (den
// kunde varken hämtas eller cachas på enheten) - då släpps alla övningar
// igenom och missing är tom. Annars filtreras det som inte längre finns
// bort och hamnar i missing som namn; kvarvarande poster får katalogens
// aktuella namn.
export function resolveTemplateExercises(
  template: WorkoutTemplate,
  catalog: ExerciseOption[],
): { exercises: TemplateExercise[]; missing: string[] } {
  const catalogUntrustworthy =
    catalog.length === 0 || catalog.some((e) => e.fallback);
  if (catalogUntrustworthy) {
    return { exercises: template.exercises, missing: [] };
  }

  const byId = new Map(catalog.map((e) => [e.id, e]));
  const exercises: TemplateExercise[] = [];
  const missing: string[] = [];
  for (const exercise of template.exercises) {
    const match = byId.get(exercise.exerciseId);
    if (match) {
      exercises.push({ ...exercise, exerciseName: match.name });
    } else {
      missing.push(exercise.exerciseName);
    }
  }
  return { exercises, missing };
}

// Bygger exakt den blob ActiveWorkoutScreen läser vid hydrering.
// Förifyllda värden är utkast: saved är ALLTID null, så de skrivs först
// vid blur eller vid avslut, precis som en handifylld rad.
export function buildActiveWorkoutFromTemplate(params: {
  userId: string;
  workoutId: string;
  startedAt: string;
  name: string;
  exercises: TemplateExercise[];
  unit: Unit;
}): ActiveWorkout {
  const { userId, workoutId, startedAt, name, exercises, unit } = params;

  const nextSetNr: Record<string, number> = {};
  const sections: PersistedSection[] = exercises.map((exercise) => {
    const workoutExerciseId = newWorkoutExerciseId();
    nextSetNr[workoutExerciseId] = exercise.sets.length + 1;
    return {
      workoutExerciseId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      sets: exercise.sets.map((set, index) => ({
        id: newSetId(),
        setNr: index + 1,
        repsDraft: set.reps === null ? "" : String(set.reps),
        weightDraft:
          set.weightKg === null ? "" : weightInputValue(set.weightKg, unit),
        saved: null,
      })),
      previousSets: [],
    };
  });

  return {
    version: 1,
    userId,
    workoutId,
    startedAt,
    name,
    nextOrderIndex: exercises.length,
    nextSetNr,
    sections,
    media: [],
  };
}
