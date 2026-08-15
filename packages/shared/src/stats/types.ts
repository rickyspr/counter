// Ett set berikat med vilken övning och vilket pass det tillhör, samt när
// passet startade. Byggs av apps genom att joina sets -> workout_exercises
// -> workouts innan datat skickas in i statistikfunktionerna nedan.
export interface SetRecord {
  reps: number;
  weight_kg: number;
  exercise_id: string;
  workout_id: string;
  workout_started_at: string;
}

export interface WorkoutSummary {
  totalVolumeKg: number;
  setCount: number;
  exerciseCount: number;
  durationMinutes: number | null;
}

export interface WeeklyVolume {
  weekStart: string;
  volumeKg: number;
}

export interface WeeklyFrequency {
  weekStart: string;
  count: number;
}

export interface PersonalBest {
  heaviestSetKg: number;
  bestE1rmKg: number;
}

export interface ExerciseProgressionPoint {
  workoutStartedAt: string;
  topWeightKg: number;
  bestE1rmKg: number;
}
