import { describe, expect, it } from "vitest";
import { defaultWorkoutName } from "./workout-name";

// Datumen byggs med new Date(år, månad, dag, timme) - alltså LOKAL tid,
// samma tidszon som defaultWorkoutName läser. Med ISO-strängar hade
// testet gett olika svar beroende på var det kördes.
function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 21, hour, minute);
}

describe("defaultWorkoutName", () => {
  it("names each part of the day", () => {
    expect(defaultWorkoutName(at(2))).toBe("Gym på natten");
    expect(defaultWorkoutName(at(8))).toBe("Gym på förmiddagen");
    expect(defaultWorkoutName(at(14))).toBe("Gym på dagen");
    expect(defaultWorkoutName(at(20))).toBe("Gym på kvällen");
  });

  it("puts each boundary minute on the right side", () => {
    expect(defaultWorkoutName(at(4, 59))).toBe("Gym på natten");
    expect(defaultWorkoutName(at(5, 0))).toBe("Gym på förmiddagen");
    expect(defaultWorkoutName(at(11, 59))).toBe("Gym på förmiddagen");
    expect(defaultWorkoutName(at(12, 0))).toBe("Gym på dagen");
    expect(defaultWorkoutName(at(17, 59))).toBe("Gym på dagen");
    expect(defaultWorkoutName(at(18, 0))).toBe("Gym på kvällen");
    expect(defaultWorkoutName(at(23, 59))).toBe("Gym på kvällen");
    expect(defaultWorkoutName(at(0, 0))).toBe("Gym på natten");
  });

  it("accepts the ISO string the database hands back", () => {
    const iso = at(20, 30).toISOString();
    expect(defaultWorkoutName(iso)).toBe("Gym på kvällen");
  });
});
