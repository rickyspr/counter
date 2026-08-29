// Ögonblicksbilden som skickas från ActiveWorkoutScreen till
// WorkoutSummaryScreen när ett pass avslutats. Rent presentationsdata,
// byggt helt LOKALT ur skärmens state - inget serveranrop. Firandet och
// överblicken ska funka även när passet loggats offline och bara ligger
// i synk-kön.
//
// Statistiken räknas av samma delade funktioner som resten av appen
// (summarizeWorkout, calculateE1rm) - ingen ny räknelogik här.

import {
  calculateE1rm,
  summarizeWorkout,
  type ExerciseProgressionPoint,
  type SetRecord,
  type WorkoutSummary,
} from "@repcount/shared";
import type { PersistedMedia } from "./active-workout";
import type { PreviousSet } from "./queries";
import type { LoggedSet } from "./set-parsing";

interface SavedSet {
  reps: number;
  weightKg: number;
}

export interface FinishedExercise {
  exerciseId: string;
  name: string;
  sets: SavedSet[];
}

export interface FinishedWorkoutSummary {
  workoutId: string;
  // Redan upplöst: nameDraft om det finns, annars defaultWorkoutName.
  name: string;
  startedAt: string;
  endedAt: string;
  summary: WorkoutSummary;
  exercises: FinishedExercise[];
  media: PersistedMedia[];
  // Sant om något e1RM i passet slog motsvarande övnings förra pass.
  beatPrevious: boolean;
}

// Minimal vy av en ActiveWorkoutScreen-section - bara det bygget behöver,
// så filen slipper importera från skärmen (och skapa en cykel).
export interface FinishedWorkoutSection {
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
  previousSets: PreviousSet[];
}

function savedSets(sets: LoggedSet[]): SavedSet[] {
  const out: SavedSet[] = [];
  for (const set of sets) {
    if (set.saved !== null) out.push(set.saved);
  }
  return out;
}

function bestE1rm(sets: SavedSet[]): number {
  return sets.reduce(
    (max, s) => Math.max(max, calculateE1rm({ reps: s.reps, weight_kg: s.weightKg })),
    0,
  );
}

function beatPreviousInSection(section: FinishedWorkoutSection): boolean {
  const previousBest = bestE1rm(section.previousSets);
  // Ingen tidigare data att slå - inte ett "kap".
  if (previousBest === 0) return false;
  return bestE1rm(savedSets(section.sets)) > previousBest;
}

// Vilka övningar i passet som satte ett nytt TYNGSTA LYFT - mätt mot hela
// den tidigare historiken, inte bara förra passet. Ren jämförelse;
// anroparen hämtar historiken (get_exercise_progression per övning, som
// ger en rad per pass och alltså inte trunkeras som en set-lista).
//
// Första gången en övning loggas räknas INTE som ett rekord: en stjärna
// för "du lyfte tyngre än aldrig tidigare" är inte motiverande.
//
// Kräver nät. Utan uppkoppling är historiken tom -> inga stjärnor, hellre
// det än en felaktig stjärna.
export function exercisesWithNewHeaviest(
  exercises: FinishedExercise[],
  startedAt: string,
  historyByExerciseId: Map<string, ExerciseProgressionPoint[]>,
): Set<string> {
  const startedMs = Date.parse(startedAt);
  const result = new Set<string>();

  for (const exercise of exercises) {
    const topThisWorkout = exercise.sets.reduce(
      (max, s) => Math.max(max, s.weightKg),
      0,
    );
    if (topThisWorkout <= 0) continue;

    // Strikt tidigare pass. Det utesluter dagens pass oavsett om det
    // redan hunnit synka (då finns det i svaret) eller inte.
    const priorTops = (historyByExerciseId.get(exercise.exerciseId) ?? [])
      .filter((point) => Date.parse(point.workoutStartedAt) < startedMs)
      .map((point) => point.topWeightKg);
    if (priorTops.length === 0) continue;

    if (topThisWorkout > Math.max(...priorTops)) result.add(exercise.exerciseId);
  }

  return result;
}

export function buildFinishedWorkoutSummary(
  workoutId: string,
  name: string,
  startedAt: string,
  endedAt: string,
  sections: FinishedWorkoutSection[],
  media: PersistedMedia[],
): FinishedWorkoutSummary {
  const exercises: FinishedExercise[] = sections.map((section) => ({
    exerciseId: section.exerciseId,
    name: section.exerciseName,
    sets: savedSets(section.sets),
  }));

  // summarizeWorkout läser bara reps, weight_kg och exercise_id ur varje
  // SetRecord - resten krävs av typen men ignoreras.
  const setRecords: SetRecord[] = sections.flatMap((section) =>
    savedSets(section.sets).map((s) => ({
      reps: s.reps,
      weight_kg: s.weightKg,
      exercise_id: section.exerciseId,
      workout_id: workoutId,
      workout_started_at: startedAt,
    })),
  );

  return {
    workoutId,
    name,
    startedAt,
    endedAt,
    summary: summarizeWorkout({ started_at: startedAt, ended_at: endedAt }, setRecords),
    exercises,
    media,
    beatPrevious: sections.some(beatPreviousInSection),
  };
}
