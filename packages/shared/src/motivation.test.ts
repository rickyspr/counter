import { describe, expect, it } from "vitest";
import {
  firstName,
  pickHomeGreeting,
  pickWorkoutPraise,
  timeOfDayBucket,
} from "./motivation";

// Lokal tid, samma tidszon som timeOfDayBucket läser.
function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 21, hour, minute);
}

describe("timeOfDayBucket", () => {
  it("names each part of the day", () => {
    expect(timeOfDayBucket(at(2))).toBe("natt");
    expect(timeOfDayBucket(at(7))).toBe("morgon");
    expect(timeOfDayBucket(at(12))).toBe("dag");
    expect(timeOfDayBucket(at(16))).toBe("eftermiddag");
    expect(timeOfDayBucket(at(21))).toBe("kväll");
  });

  it("puts each boundary hour on the right side", () => {
    expect(timeOfDayBucket(at(4, 59))).toBe("natt");
    expect(timeOfDayBucket(at(5, 0))).toBe("morgon");
    expect(timeOfDayBucket(at(9, 59))).toBe("morgon");
    expect(timeOfDayBucket(at(10, 0))).toBe("dag");
    expect(timeOfDayBucket(at(13, 59))).toBe("dag");
    expect(timeOfDayBucket(at(14, 0))).toBe("eftermiddag");
    expect(timeOfDayBucket(at(17, 59))).toBe("eftermiddag");
    expect(timeOfDayBucket(at(18, 0))).toBe("kväll");
    expect(timeOfDayBucket(at(23, 59))).toBe("kväll");
    expect(timeOfDayBucket(at(0, 0))).toBe("natt");
  });
});

describe("firstName", () => {
  it("takes the first token", () => {
    expect(firstName("Rickard Hjerpe")).toBe("Rickard");
    expect(firstName("  Rickard   Hjerpe ")).toBe("Rickard");
    expect(firstName("Rickard")).toBe("Rickard");
  });

  it("treats missing names and email addresses as no name", () => {
    expect(firstName(null)).toBe("");
    expect(firstName(undefined)).toBe("");
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
    expect(firstName("rickard.hjerpe@gmail.com")).toBe("");
  });
});

describe("pickHomeGreeting", () => {
  it("is deterministic for the same day, bucket and name", () => {
    const a = pickHomeGreeting({ name: "Rickard", now: at(8, 0) });
    const b = pickHomeGreeting({ name: "Rickard", now: at(8, 45) });
    expect(a).toEqual(b);
  });

  it("uses the name when given", () => {
    // Prova hela dagen så minst en mall med {, name}/{name|..} träffas.
    const withName = [2, 7, 12, 16, 21]
      .map((h) => pickHomeGreeting({ name: "Rickard", now: at(h) }))
      .map((g) => `${g.headline} ${g.subline}`)
      .join(" ");
    expect(withName).toContain("Rickard");
  });

  it("never leaves a template marker or broken punctuation without a name", () => {
    for (const hour of [2, 7, 12, 16, 21]) {
      const { headline, subline } = pickHomeGreeting({ name: "", now: at(hour) });
      for (const text of [headline, subline]) {
        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toMatch(/\s[,.]/); // " ," eller " ."
        expect(text.trimEnd()).toBe(text);
        expect(text).not.toMatch(/,\s*$/);
      }
    }
  });

  it("gives a morning greeting in the morning and an evening one in the evening", () => {
    const morning = pickHomeGreeting({ name: "Rickard", now: at(7) });
    const evening = pickHomeGreeting({ name: "Rickard", now: at(21) });
    expect(morning).not.toEqual(evening);
  });
});

describe("pickWorkoutPraise", () => {
  const endedMorning = at(9, 0).toISOString();

  it("is deterministic for a given end time", () => {
    const a = pickWorkoutPraise({ name: "Rickard", endedAt: endedMorning, beatPrevious: false });
    const b = pickWorkoutPraise({ name: "Rickard", endedAt: endedMorning, beatPrevious: false });
    expect(a).toBe(b);
  });

  it("never leaves a marker or broken punctuation without a name", () => {
    for (let day = 1; day <= 28; day++) {
      const endedAt = new Date(2026, 5, day, 22, 15).toISOString();
      for (const beatPrevious of [true, false]) {
        const text = pickWorkoutPraise({ name: "", endedAt, beatPrevious });
        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toMatch(/\s[,.]/);
        expect(text).not.toMatch(/,\s*$/);
      }
    }
  });

  it("can produce a progression line when a previous best was beaten", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      const endedAt = new Date(2026, 5, day, 12, 0).toISOString();
      seen.add(pickWorkoutPraise({ name: "Rickard", endedAt, beatPrevious: true }));
    }
    expect([...seen].some((t) => /progression|kap|slog|uppåt/i.test(t))).toBe(true);
  });

  it("can produce a late-night line for a workout finished at night", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      const endedAt = new Date(2026, 5, day, 1, 30).toISOString();
      seen.add(pickWorkoutPraise({ name: "Rickard", endedAt, beatPrevious: false }));
    }
    expect([...seen].some((t) => /sen kväll|Sent på dygnet|hängivenhet/i.test(t))).toBe(true);
  });
});
