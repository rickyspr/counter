import { isoWeekStart } from "./date-utils";
import type { SetRecord, WeeklyVolume } from "./types";

export function calculateVolume(sets: { reps: number; weight_kg: number }[]): number {
  return sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0);
}

export function volumePerWeek(sets: SetRecord[]): WeeklyVolume[] {
  const byWeek = new Map<string, number>();

  for (const set of sets) {
    const weekStart = isoWeekStart(set.workout_started_at);
    const current = byWeek.get(weekStart) ?? 0;
    byWeek.set(weekStart, current + set.reps * set.weight_kg);
  }

  return Array.from(byWeek.entries())
    .map(([weekStart, volumeKg]) => ({ weekStart, volumeKg }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
