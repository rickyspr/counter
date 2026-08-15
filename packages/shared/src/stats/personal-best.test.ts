import { describe, expect, it } from "vitest";
import { personalBestForExercise, progressionForExercise } from "./personal-best";
import type { SetRecord } from "./types";

const sets: SetRecord[] = [
  {
    reps: 5,
    weight_kg: 100,
    exercise_id: "bench",
    workout_id: "w1",
    workout_started_at: "2026-08-01T10:00:00.000Z",
  },
  {
    reps: 3,
    weight_kg: 110,
    exercise_id: "bench",
    workout_id: "w1",
    workout_started_at: "2026-08-01T10:00:00.000Z",
  },
  {
    reps: 5,
    weight_kg: 105,
    exercise_id: "bench",
    workout_id: "w2",
    workout_started_at: "2026-08-10T10:00:00.000Z",
  },
  {
    reps: 5,
    weight_kg: 140,
    exercise_id: "squat",
    workout_id: "w2",
    workout_started_at: "2026-08-10T10:00:00.000Z",
  },
];

describe("personalBestForExercise", () => {
  it("finds the heaviest set and best e1RM for an exercise", () => {
    expect(personalBestForExercise(sets, "bench")).toEqual({
      heaviestSetKg: 110,
      bestE1rmKg: Math.max(
        100 * (1 + 5 / 30),
        110 * (1 + 3 / 30),
        105 * (1 + 5 / 30),
      ),
    });
  });

  it("returns null when the exercise has no sets", () => {
    expect(personalBestForExercise(sets, "deadlift")).toBeNull();
  });
});

describe("progressionForExercise", () => {
  it("returns one point per workout, sorted by date, ignoring other exercises", () => {
    const progression = progressionForExercise(sets, "bench");

    expect(progression).toEqual([
      {
        workoutStartedAt: "2026-08-01T10:00:00.000Z",
        topWeightKg: 110,
        bestE1rmKg: Math.max(100 * (1 + 5 / 30), 110 * (1 + 3 / 30)),
      },
      {
        workoutStartedAt: "2026-08-10T10:00:00.000Z",
        topWeightKg: 105,
        bestE1rmKg: 105 * (1 + 5 / 30),
      },
    ]);
  });

  it("returns an empty list when the exercise never occurs", () => {
    expect(progressionForExercise(sets, "deadlift")).toEqual([]);
  });
});
