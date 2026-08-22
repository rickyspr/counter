import { describe, expect, it } from "vitest";
import {
  avatarExtensionForMimeType,
  avatarStoragePath,
  calculateAge,
  parseDateOnly,
  toDateOnlyString,
} from "./profile";

// Built with new Date(year, monthIndex, day) - LOCAL time, the same
// calendar calculateAge reads. ISO strings would make the answers
// depend on where the test runs, which is the exact bug these
// functions exist to avoid.
function on(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

describe("calculateAge", () => {
  it("counts completed years", () => {
    expect(calculateAge("1990-05-17", on(2026, 8, 22))).toBe(36);
  });

  it("waits for the birthday", () => {
    expect(calculateAge("1990-05-17", on(2026, 5, 16))).toBe(35);
    expect(calculateAge("1990-05-17", on(2026, 5, 17))).toBe(36);
    expect(calculateAge("1990-05-17", on(2026, 5, 18))).toBe(36);
  });

  it("handles the turn of the year in both directions", () => {
    expect(calculateAge("1990-01-01", on(2025, 12, 31))).toBe(35);
    expect(calculateAge("1990-01-01", on(2026, 1, 1))).toBe(36);
    expect(calculateAge("1990-12-31", on(2026, 1, 1))).toBe(35);
  });

  it("rolls a February 29th birthday over on March 1st", () => {
    expect(calculateAge("2000-02-29", on(2027, 2, 28))).toBe(26);
    expect(calculateAge("2000-02-29", on(2027, 3, 1))).toBe(27);
    // The anniversary itself, in a leap year.
    expect(calculateAge("2000-02-29", on(2028, 2, 29))).toBe(28);
  });

  it("is zero on the day someone is born", () => {
    expect(calculateAge("2026-08-22", on(2026, 8, 22))).toBe(0);
  });

  it("returns null rather than a negative age for a future date", () => {
    expect(calculateAge("2027-01-01", on(2026, 8, 22))).toBeNull();
    expect(calculateAge("2026-08-23", on(2026, 8, 22))).toBeNull();
  });

  it("returns null for anything that is not a real date", () => {
    expect(calculateAge("", on(2026, 8, 22))).toBeNull();
    expect(calculateAge("1990-13-01", on(2026, 8, 22))).toBeNull();
    // Would silently roll forward to March 2nd if handed to Date.
    expect(calculateAge("2025-02-30", on(2026, 8, 22))).toBeNull();
    // A common year has no 29th of February.
    expect(calculateAge("2001-02-29", on(2026, 8, 22))).toBeNull();
    expect(calculateAge("17 maj 1990", on(2026, 8, 22))).toBeNull();
  });
});

describe("toDateOnlyString", () => {
  it("uses the local calendar day, not the UTC one", () => {
    // 01:00 in a timezone ahead of UTC is still the previous day in
    // UTC, which is what toISOString() would have written.
    expect(toDateOnlyString(new Date(1990, 4, 17, 1, 0))).toBe("1990-05-17");
    expect(toDateOnlyString(new Date(1990, 4, 17, 23, 30))).toBe("1990-05-17");
  });

  it("pads month and day", () => {
    expect(toDateOnlyString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips through parseDateOnly", () => {
    const parsed = parseDateOnly("2026-01-05");
    expect(parsed).not.toBeNull();
    expect(toDateOnlyString(parsed!)).toBe("2026-01-05");
  });
});

describe("parseDateOnly", () => {
  it("lands on the picked calendar day", () => {
    const parsed = parseDateOnly("1990-05-17")!;
    expect(parsed.getFullYear()).toBe(1990);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(17);
  });

  it("rejects what calculateAge rejects", () => {
    expect(parseDateOnly("2025-02-30")).toBeNull();
    expect(parseDateOnly("nope")).toBeNull();
  });
});

describe("avatarExtensionForMimeType", () => {
  it("accepts the image types the bucket allows", () => {
    expect(avatarExtensionForMimeType("image/jpeg")).toBe("jpg");
    expect(avatarExtensionForMimeType("image/png")).toBe("png");
    expect(avatarExtensionForMimeType("image/heic")).toBe("heic");
  });

  it("normalises case and parameters", () => {
    expect(avatarExtensionForMimeType("IMAGE/JPEG")).toBe("jpg");
    expect(avatarExtensionForMimeType("image/jpeg; charset=binary")).toBe("jpg");
  });

  it("rejects video and unknown types", () => {
    // Allowed on a workout, never as a profile picture.
    expect(avatarExtensionForMimeType("video/mp4")).toBeNull();
    expect(avatarExtensionForMimeType("application/pdf")).toBeNull();
    expect(avatarExtensionForMimeType(null)).toBeNull();
  });
});

describe("avatarStoragePath", () => {
  it("puts the user id first", () => {
    expect(avatarStoragePath("user-1", "avatar-1", "jpg")).toBe(
      "user-1/avatar-1.jpg",
    );
  });

  it("tolerates the leading dot Expo's File.extension carries", () => {
    expect(avatarStoragePath("user-1", "avatar-1", ".JPG")).toBe(
      "user-1/avatar-1.jpg",
    );
  });
});
