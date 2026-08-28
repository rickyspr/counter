import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { ExerciseProgressionPoint } from "../stats";

type Client = SupabaseClient<Database>;

// Wrappers kring översiktsaggregaten i
// 20260828120000_web_overview_rpcs.sql. numeric kommer tillbaka som
// number via PostgREST men coercas ändå med Number() - samma försiktighet
// som fetchTrainingStats.

export interface WeeklyTrainingPoint {
  weekStart: string;
  volumeKg: number;
  workoutCount: number;
}

export async function fetchWeeklyTrainingSeries(
  client: Client,
): Promise<WeeklyTrainingPoint[]> {
  const { data, error } = await client.rpc("get_weekly_training_series");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    weekStart: row.week_start,
    volumeKg: Number(row.volume_kg),
    workoutCount: Number(row.workout_count),
  }));
}

export interface ExercisePersonalBest {
  exerciseId: string;
  exerciseName: string;
  heaviestSetKg: number;
  bestE1rmKg: number;
  workoutCount: number;
}

export async function fetchExercisePersonalBests(
  client: Client,
): Promise<ExercisePersonalBest[]> {
  const { data, error } = await client.rpc("get_exercise_personal_bests");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    heaviestSetKg: Number(row.heaviest_set_kg),
    bestE1rmKg: Number(row.best_e1rm_kg),
    workoutCount: Number(row.workout_count),
  }));
}

// Formen matchar ExerciseProgressionPoint (stats/types.ts) så resultatet
// går rakt in i ProgressionChart.
export async function fetchExerciseProgression(
  client: Client,
  exerciseId: string,
): Promise<ExerciseProgressionPoint[]> {
  const { data, error } = await client.rpc("get_exercise_progression", {
    p_exercise_id: exerciseId,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    workoutStartedAt: row.workout_started_at,
    topWeightKg: Number(row.top_weight_kg),
    bestE1rmKg: Number(row.best_e1rm_kg),
  }));
}
