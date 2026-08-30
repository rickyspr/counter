import { describe, expect, it } from "vitest";
import {
  localDayEndExclusiveIso,
  localDayStartIso,
  toLocalDateOnly,
  toLocalTimeOnly,
} from "./local-time";

// Tidszonsoberoende: Date byggs av lokala delar och resultatet läses
// tillbaka med lokala getters. Inga ISO-strängliteraler jämförs direkt.

describe("toLocalDateOnly", () => {
  it("uses local time, not UTC", () => {
    expect(toLocalDateOnly(new Date(2026, 7, 30, 23, 30))).toBe("2026-08-30");
  });

  it("rolls to the next day at local midnight", () => {
    expect(toLocalDateOnly(new Date(2026, 7, 31, 0, 15))).toBe("2026-08-31");
  });

  it("zero-pads month and day", () => {
    expect(toLocalDateOnly(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("toLocalTimeOnly", () => {
  it("zero-pads hour and minute", () => {
    expect(toLocalTimeOnly(new Date(2026, 7, 30, 6, 5))).toBe("06:05");
  });

  it("accepts the ISO string the database hands back", () => {
    expect(toLocalTimeOnly(new Date(2026, 7, 30, 18, 5).toISOString())).toBe(
      "18:05",
    );
  });
});

describe("localDayStartIso", () => {
  it("is local midnight of that date", () => {
    const d = new Date(localDayStartIso("2026-08-30"));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("throws on invalid input", () => {
    expect(() => localDayStartIso("")).toThrow();
  });
});

describe("localDayEndExclusiveIso", () => {
  it("is the next local midnight", () => {
    const d = new Date(localDayEndExclusiveIso("2026-08-30"));
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(0);
  });

  it("normalises across a month boundary", () => {
    const d = new Date(localDayEndExclusiveIso("2026-08-31"));
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });
});
