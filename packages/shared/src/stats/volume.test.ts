import { describe, expect, it } from "vitest";
import { calculateVolume, volumePerWeek } from "./volume";
import type { SetRecord } from "./types";

describe("calculateVolume", () => {
  it("sums reps times weight across sets", () => {
    const sets = [
      { reps: 10, weight_kg: 50 },
      { reps: 8, weight_kg: 60 },
    ];
    expect(calculateVolume(sets)).toBe(10 * 50 + 8 * 60);
  });

  it("returns 0 for an empty list", () => {
    expect(calculateVolume([])).toBe(0);
  });
});

describe("volumePerWeek", () => {
  const makeSet = (overrides: Partial<SetRecord>): SetRecord => ({
    reps: 10,
    weight_kg: 50,
    exercise_id: "bench",
    workout_id: "w1",
    workout_started_at: "2026-08-10T10:00:00.000Z",
    ...overrides,
  });

  it("groups volume by ISO week (Monday start)", () => {
    const sets = [
      // Måndag 2026-08-10
      makeSet({ workout_started_at: "2026-08-10T10:00:00.000Z" }),
      // Söndag 2026-08-16, samma vecka
      makeSet({ workout_started_at: "2026-08-16T10:00:00.000Z" }),
      // Måndag 2026-08-17, nästa vecka
      makeSet({ workout_started_at: "2026-08-17T10:00:00.000Z" }),
    ];

    expect(volumePerWeek(sets)).toEqual([
      { weekStart: "2026-08-10", volumeKg: 2 * 500 },
      { weekStart: "2026-08-17", volumeKg: 500 },
    ]);
  });

  it("returns an empty list for no sets", () => {
    expect(volumePerWeek([])).toEqual([]);
  });
});
