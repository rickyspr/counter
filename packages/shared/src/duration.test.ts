import { describe, expect, it } from "vitest";
import { elapsedMinutes, formatCountdown, formatDuration } from "./duration";

describe("formatCountdown", () => {
  it("formats zero", () => {
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("formats sub-minute values with a padded second", () => {
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(59)).toBe("0:59");
  });

  it("formats values over a minute", () => {
    expect(formatCountdown(83)).toBe("1:23");
    expect(formatCountdown(600)).toBe("10:00");
  });

  it("floors partial seconds", () => {
    expect(formatCountdown(83.9)).toBe("1:23");
  });

  it("clamps negative and NaN to 0:00", () => {
    expect(formatCountdown(-5)).toBe("0:00");
    expect(formatCountdown(NaN)).toBe("0:00");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as minutes", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(59)).toBe("59 min");
  });

  it("formats whole hours without a minute part", () => {
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(120)).toBe("2 h");
  });

  it("formats hours and minutes together", () => {
    expect(formatDuration(64)).toBe("1 h 4 min");
  });

  it("rounds to the nearest minute inside the function", () => {
    expect(formatDuration(44.6)).toBe("45 min");
    expect(formatDuration(59.5)).toBe("1 h");
  });
});

describe("elapsedMinutes", () => {
  // ISO-strängen byggs i lokal tid, samma tidszon som now.
  const start = new Date(2026, 7, 21, 10, 0, 0);
  const startIso = start.toISOString();

  it("is 0 at exactly the start time", () => {
    expect(elapsedMinutes(startIso, start)).toBe(0);
  });

  it("floors partial minutes", () => {
    expect(elapsedMinutes(startIso, new Date(start.getTime() + 59_000))).toBe(0);
    expect(elapsedMinutes(startIso, new Date(start.getTime() + 60_000))).toBe(1);
  });

  it("counts whole minutes over hours", () => {
    const now = new Date(start.getTime() + (3 * 60 + 4) * 60_000);
    expect(elapsedMinutes(startIso, now)).toBe(184);
  });

  it("clamps to 0 when now is before the start", () => {
    expect(elapsedMinutes(startIso, new Date(start.getTime() - 5_000))).toBe(0);
  });

  it("clamps to 0 for an unparseable string", () => {
    expect(elapsedMinutes("not a date", start)).toBe(0);
  });

  it("accepts a Date the same as an ISO string", () => {
    const now = new Date(start.getTime() + 90_000);
    expect(elapsedMinutes(start, now)).toBe(elapsedMinutes(startIso, now));
  });
});
