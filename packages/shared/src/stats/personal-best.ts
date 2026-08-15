import { calculateE1rm } from "./e1rm";
import type { ExerciseProgressionPoint, PersonalBest, SetRecord } from "./types";

export function personalBestForExercise(
  sets: SetRecord[],
  exerciseId: string,
): PersonalBest | null {
  const exerciseSets = sets.filter((s) => s.exercise_id === exerciseId);
  if (exerciseSets.length === 0) {
    return null;
  }

  return {
    heaviestSetKg: Math.max(...exerciseSets.map((s) => s.weight_kg)),
    bestE1rmKg: Math.max(...exerciseSets.map((s) => calculateE1rm(s))),
  };
}

// En punkt per pass (inte per set) där övningen förekom, sorterat
// stigande på passdatum - redo att rita upp som progressionsgraf.
export function progressionForExercise(
  sets: SetRecord[],
  exerciseId: string,
): ExerciseProgressionPoint[] {
  const byWorkout = new Map<string, SetRecord[]>();

  for (const set of sets) {
    if (set.exercise_id !== exerciseId) continue;
    const existing = byWorkout.get(set.workout_id) ?? [];
    existing.push(set);
    byWorkout.set(set.workout_id, existing);
  }

  return Array.from(byWorkout.values())
    .map((workoutSets) => ({
      workoutStartedAt: workoutSets[0]!.workout_started_at,
      topWeightKg: Math.max(...workoutSets.map((s) => s.weight_kg)),
      bestE1rmKg: Math.max(...workoutSets.map((s) => calculateE1rm(s))),
    }))
    .sort((a, b) => a.workoutStartedAt.localeCompare(b.workoutStartedAt));
}
