import type { SetRecord } from "@repcount/shared";
import { supabase } from "./supabase";

export interface ExerciseOption {
  id: string;
  name: string;
  muscle_group: string | null;
}

export async function fetchExerciseCatalog(): Promise<ExerciseOption[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, muscle_group")
    .order("muscle_group", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function startWorkout(userId: string) {
  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId })
    .select("id, started_at")
    .single();
  if (error) throw error;
  return data;
}

export async function endWorkout(workoutId: string) {
  const { data, error } = await supabase
    .from("workouts")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", workoutId)
    .select("id, started_at, ended_at")
    .single();
  if (error) throw error;
  return data;
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  orderIndex: number,
) {
  const { data, error } = await supabase
    .from("workout_exercises")
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      order_index: orderIndex,
    })
    .select("id, exercise_id")
    .single();
  if (error) throw error;
  return data;
}

export async function addSet(
  workoutExerciseId: string,
  setNr: number,
  reps: number,
  weightKg: number,
) {
  const { data, error } = await supabase
    .from("sets")
    .insert({
      workout_exercise_id: workoutExerciseId,
      set_nr: setNr,
      reps,
      weight_kg: weightKg,
    })
    .select("id, set_nr, reps, weight_kg")
    .single();
  if (error) throw error;
  return data;
}

interface LatestWorkoutSummaryInput {
  workout: { started_at: string; ended_at: string | null };
  sets: SetRecord[];
}

// Hämtar det senast avslutade passet för en användare, samt alla dess set
// i det format som statistikfunktionerna i @repcount/shared förväntar sig.
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
