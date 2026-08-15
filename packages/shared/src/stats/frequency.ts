import { isoWeekStart } from "./date-utils";
import type { WeeklyFrequency } from "./types";

// `workoutStartedAtTimestamps` ska innehålla en tidsstämpel per pass
// (workouts.started_at), inte per set.
export function workoutFrequencyPerWeek(
  workoutStartedAtTimestamps: string[],
): WeeklyFrequency[] {
  const byWeek = new Map<string, number>();

  for (const startedAt of workoutStartedAtTimestamps) {
    const weekStart = isoWeekStart(startedAt);
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + 1);
  }

  return Array.from(byWeek.entries())
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
