import type { SetRecord } from "@repcount/shared";
import * as Crypto from "expo-crypto";
import { enqueue } from "./offline-queue";
import { readJSON, writeJSON } from "./storage";
import { supabase } from "./supabase";

export interface ExerciseOption {
  id: string;
  name: string;
  muscle_group: string | null;
}

const EXERCISE_CACHE_KEY = "repcount:exercise-cache";

// Övningskatalogen ändras sällan, så vi cachar den lokalt och faller
// tillbaka på cachen om nätverket är nere - annars går det inte att
// välja övning för ett pass som loggas helt offline. Delar samma
// pågående/klara hämtning mellan anropare inom sessionen (t.ex.
// hemskärmens uppvärmning och sedan pass-skärmens mount) istället
// för att hämta och skriva om cachen två gånger i rad.
let catalogPromise: Promise<ExerciseOption[]> | null = null;

export function fetchExerciseCatalog(): Promise<ExerciseOption[]> {
  if (!catalogPromise) {
    catalogPromise = loadExerciseCatalog().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
}

async function loadExerciseCatalog(): Promise<ExerciseOption[]> {
  try {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, muscle_group")
      .order("muscle_group", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    await writeJSON(EXERCISE_CACHE_KEY, data);
    return data;
  } catch (err) {
    const cached = await readJSON<ExerciseOption[] | null>(EXERCISE_CACHE_KEY, null);
    if (cached) return cached;
    throw err;
  }
}

// Mutationsfunktionerna nedan skriver ALDRIG direkt mot Supabase.
// De genererar ett lokalt id och lägger åtgärden i synk-kön (se
// offline-queue.ts). enqueue() väntar bara in det LOKALA sparandet
// (millisekunder) innan den returnerar - inte nätverkssynken, som
// sker i bakgrunden. Det gör att ett helt pass går att logga utan
// nätverk, samtidigt som varje steg är säkert sparat på disk innan
// appen tillåts stängas.

export async function startWorkout(
  userId: string,
): Promise<{ id: string; started_at: string }> {
  const id = Crypto.randomUUID();
  const started_at = new Date().toISOString();
  await enqueue({ type: "start_workout", id, user_id: userId, started_at });
  return { id, started_at };
}

export async function endWorkout(workoutId: string): Promise<{ ended_at: string }> {
  const ended_at = new Date().toISOString();
  await enqueue({ type: "end_workout", workout_id: workoutId, ended_at });
  return { ended_at };
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<{ id: string; exercise_id: string }> {
  const id = Crypto.randomUUID();
  await enqueue({
    type: "add_exercise",
    id,
    workout_id: workoutId,
    exercise_id: exerciseId,
    order_index: orderIndex,
  });
  return { id, exercise_id: exerciseId };
}

export async function addSet(
  workoutExerciseId: string,
  setNr: number,
  reps: number,
  weightKg: number,
): Promise<{ id: string }> {
  const id = Crypto.randomUUID();
  await saveSet(id, workoutExerciseId, setNr, reps, weightKg);
  return { id };
}

// Att rätta ett redan loggat set är samma åtgärd som att lägga till
// det: kön skickar en upsert, så samma id + set_nr skriver bara över
// reps/vikt. Fungerar oavsett om originalet hunnit synkas eller
// fortfarande ligger kvar i kön.
export async function saveSet(
  setId: string,
  workoutExerciseId: string,
  setNr: number,
  reps: number,
  weightKg: number,
): Promise<void> {
  await enqueue({
    type: "add_set",
    id: setId,
    workout_exercise_id: workoutExerciseId,
    set_nr: setNr,
    reps,
    weight_kg: weightKg,
  });
}

export async function deleteSet(setId: string): Promise<void> {
  await enqueue({ type: "delete_set", id: setId });
}

export async function removeExerciseFromWorkout(
  workoutExerciseId: string,
): Promise<void> {
  await enqueue({ type: "delete_exercise", id: workoutExerciseId });
}

interface LatestWorkoutSummaryInput {
  workout: { started_at: string; ended_at: string | null };
  sets: SetRecord[];
}

// Hämtar det senast avslutade passet för en användare, samt alla dess set
// i det format som statistikfunktionerna i @repcount/shared förväntar sig.
// Kräver nätverk - se CLAUDE.md: offline-stödet täcker loggning, inte
// att bläddra i historik/statistik offline.
export async function fetchLatestWorkoutSummaryInput(
  userId: string,
): Promise<LatestWorkoutSummaryInput | null> {
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("id, started_at, ended_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) return null;

  const { data: workoutExercises, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, exercise_id")
    .eq("workout_id", workout.id);
  if (weError) throw weError;

  if (!workoutExercises || workoutExercises.length === 0) {
    return { workout, sets: [] };
  }

  const exerciseByWorkoutExerciseId = new Map(
    workoutExercises.map((we) => [we.id, we.exercise_id]),
  );

  const { data: setRows, error: setsError } = await supabase
    .from("sets")
    .select("reps, weight_kg, workout_exercise_id")
    .in(
      "workout_exercise_id",
      workoutExercises.map((we) => we.id),
    );
  if (setsError) throw setsError;

  const sets: SetRecord[] = (setRows ?? []).map((row) => ({
    reps: row.reps,
    weight_kg: row.weight_kg,
    exercise_id: exerciseByWorkoutExerciseId.get(row.workout_exercise_id) ?? "",
    workout_id: workout.id,
    workout_started_at: workout.started_at,
  }));

  return { workout, sets };
}
