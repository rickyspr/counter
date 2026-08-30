import { describe, expect, it } from "vitest";
import { keysetFilter } from "./workout-history";

describe("keysetFilter", () => {
  it("quotes the timestamp and spells out the exact PostgREST or-expression", () => {
    expect(
      keysetFilter({
        startedAt: "2026-08-30T18:05:00+02:00",
        id: "abc-123",
      }),
    ).toBe(
      'started_at.lt."2026-08-30T18:05:00+02:00",and(started_at.eq."2026-08-30T18:05:00+02:00",id.lt.abc-123)',
    );
  });
});
