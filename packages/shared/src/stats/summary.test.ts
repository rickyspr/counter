import { describe, expect, it } from "vitest";
import { summarizeWorkout } from "./summary";
import type { SetRecord } from "./types";

describe("summarizeWorkout", () => {
  const sets: SetRecord[] = [
    {
      reps: 10,
      weight_kg: 50,
      exercise_id: "bench",
      workout_id: "w1",
      workout_started_at: "2026-08-10T10:00:00.000Z",
    },
    {
      reps: 8,
      weight_kg: 60,
      exercise_id: "bench",
      workout_id: "w1",
      workout_started_at: "2026-08-10T10:00:00.000Z",
    },
    {
      reps: 5,
      weight_kg: 100,
      exercise_id: "squat",
      workout_id: "w1",
      workout_started_at: "2026-08-10T10:00:00.000Z",
    },
  ];

  it("computes total volume, set count, exercise count and duration", () => {
    const summary = summarizeWorkout(
      { started_at: "2026-08-10T10:00:00.000Z", ended_at: "2026-08-10T11:15:00.000Z" },
      sets,
    );

    expect(summary).toEqual({
      totalVolumeKg: 10 * 50 + 8 * 60 + 5 * 100,
      setCount: 3,
      exerciseCount: 2,
      durationMinutes: 75,
    });
  });

  it("returns null duration when the workout has not ended", () => {
    const summary = summarizeWorkout(
      { started_at: "2026-08-10T10:00:00.000Z", ended_at: null },
      sets,
    );
    expect(summary.durationMinutes).toBeNull();
  });
});
