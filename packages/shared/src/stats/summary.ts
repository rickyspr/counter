import { calculateVolume } from "./volume";
import type { SetRecord, WorkoutSummary } from "./types";

export function summarizeWorkout(
  workout: { started_at: string; ended_at: string | null },
  sets: SetRecord[],
): WorkoutSummary {
  const durationMinutes = workout.ended_at
    ? Math.round(
        (new Date(workout.ended_at).getTime() -
          new Date(workout.started_at).getTime()) /
          60_000,
      )
    : null;

  return {
    totalVolumeKg: calculateVolume(sets),
    setCount: sets.length,
    exerciseCount: new Set(sets.map((s) => s.exercise_id)).size,
    durationMinutes,
  };
}
