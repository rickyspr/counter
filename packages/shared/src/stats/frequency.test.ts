import { describe, expect, it } from "vitest";
import { workoutFrequencyPerWeek } from "./frequency";

describe("workoutFrequencyPerWeek", () => {
  it("counts workouts per ISO week", () => {
    const timestamps = [
      "2026-08-10T10:00:00.000Z", // vecka 2026-08-10
      "2026-08-12T10:00:00.000Z", // samma vecka
      "2026-08-16T10:00:00.000Z", // samma vecka (söndag)
      "2026-08-19T10:00:00.000Z", // nästa vecka
    ];

    expect(workoutFrequencyPerWeek(timestamps)).toEqual([
      { weekStart: "2026-08-10", count: 3 },
      { weekStart: "2026-08-17", count: 1 },
    ]);
  });

  it("returns an empty list for no workouts", () => {
    expect(workoutFrequencyPerWeek([])).toEqual([]);
  });
});
