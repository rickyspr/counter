import { describe, expect, it } from "vitest";
import { calculateE1rm } from "./e1rm";

describe("calculateE1rm", () => {
  it("returns the weight itself for a single rep", () => {
    expect(calculateE1rm({ reps: 1, weight_kg: 100 })).toBe(100);
  });

  it("applies the Epley formula for multiple reps", () => {
    expect(calculateE1rm({ reps: 10, weight_kg: 100 })).toBeCloseTo(133.33, 1);
  });

  it("returns the weight itself for zero reps", () => {
    expect(calculateE1rm({ reps: 0, weight_kg: 80 })).toBe(80);
  });
});
