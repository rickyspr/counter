import type { SetRecord } from "@repcount/shared";
import { supabase } from "./supabase";

export interface ExerciseName {
  id: string;
  name: string;
}

// Hämtar alla set för en användares avslutade pass, i det format som
// statistikfunktionerna i @repcount/shared förväntar sig.
export async function fetchAllSetsForUser(userId: string): Promise<SetRecord[]> {
  const { data: workouts, error: workoutsError } = await supabase
    .from("workouts")
    .select("id, started_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null);
  if (workoutsError) throw workoutsError;
  if (!workouts || workouts.length === 0) return [];

  const startedAtByWorkoutId = new Map(workouts.map((w) => [w.id, w.started_at]));

  const { data: workoutExercises, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, exercise_id, workout_id")
    .in(
      "workout_id",
      workouts.map((w) => w.id),
    );
  if (weError) throw weError;
  if (!workoutExercises || workoutExercises.length === 0) return [];

  const exerciseByWeId = new Map(
    workoutExercises.map((we) => [we.id, { exerciseId: we.exercise_id, workoutId: we.workout_id }]),
  );

  const { data: setRows, error: setsError } = await supabase
    .from("sets")
    .select("reps, weight_kg, workout_exercise_id")
    .in(
      "workout_exercise_id",
      workoutExercises.map((we) => we.id),
    );
  if (setsError) throw setsError;

  return (setRows ?? []).map((row) => {
    const context = exerciseByWeId.get(row.workout_exercise_id);
    return {
      reps: row.reps,
      weight_kg: row.weight_kg,
      exercise_id: context?.exerciseId ?? "",
      workout_id: context?.workoutId ?? "",
      workout_started_at: context ? (startedAtByWorkoutId.get(context.workoutId) ?? "") : "",
    };
  });
}

export async function fetchExerciseNames(exerciseIds: string[]): Promise<ExerciseName[]> {
  if (exerciseIds.length === 0) return [];
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name")
    .in("id", exerciseIds);
  if (error) throw error;
  return data;
}
