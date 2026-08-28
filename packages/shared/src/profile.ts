// Shared rules for the user's profile: the avatar bucket, the bounds
// every profile field is written within, and the date maths behind
// "34 år".
//
// Lives in shared for the same reason as media.ts and workout-name.ts:
// these values end up in the database and in Storage paths, so they are
// not presentation. The web app does not read profiles yet, but it
// reads the same rows.

import { extensionForMimeType, mediaTypeForMimeType } from "./media";

export const AVATAR_BUCKET = "avatars";

// Mirrors `file_size_limit` on the bucket in
// 20260822100100_avatars_storage.sql. Checked in the app before the
// upload starts so an oversized file is a sentence the user can read,
// not a 4xx from Storage.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// Avatars are cropped to a square and compressed by the picker, so this
// is generous - it exists to catch a raw multi-megabyte original that
// slipped past the editor, not to fine-tune quality.
export const AVATAR_IMAGE_QUALITY = 0.7;

// The extension to store an avatar under, or null if this is not a type
// the bucket accepts.
//
// The allow-list is `mediaTypeForMimeType(...) === "image"` rather than
// a second table: the image half of media.ts is exactly the set in
// `allowed_mime_types` on the avatars bucket, and going through it
// means case and parameters ("IMAGE/JPEG; charset=binary") are
// normalised in one place. Should the two lists ever drift apart, the
// bucket is still the authority - it rejects what it does not allow.
export function avatarExtensionForMimeType(
  mimeType: string | null | undefined,
): string | null {
  if (mediaTypeForMimeType(mimeType) !== "image") return null;
  return extensionForMimeType(mimeType);
}

// {user_id}/{avatar_id}.{ext}. user_id comes FIRST because the Storage
// policies decide ownership from the first path segment without a table
// lookup - see the migration.
//
// The caller passes a fresh uuid for every upload. Reusing one path per
// user would leave the signed-URL cache (keyed by path) and React
// Native's Image cache (keyed by URI) showing the previous picture.
export function avatarStoragePath(
  userId: string,
  avatarId: string,
  extension: string,
): string {
  // Expo's File.extension carries a leading dot, the MIME table in
  // media.ts does not. Normalised here so callers cannot produce a path
  // with a double dot that no longer matches profiles.avatar_path.
  const clean = extension.replace(/^\.+/, "").toLowerCase();
  return `${userId}/${avatarId}.${clean}`;
}

// Every bound below mirrors a check constraint in
// 20260822100000_profile_details.sql. The input fields must stay inside
// them: profile writes bypass the sync queue, so a violation is a
// dialog rather than a dropped action - still worth never showing.
export const DISPLAY_NAME_MAX_LENGTH = 60;
export const HOME_GYM_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 300;

// Exclusive on both ends, matching `body_weight_kg > 0 and < 500`.
export const MAX_BODY_WEIGHT_KG = 500;
// Inclusive, matching `height_cm between 50 and 260`.
export const MIN_HEIGHT_CM = 50;
export const MAX_HEIGHT_CM = 260;

export const EARLIEST_BIRTH_DATE = "1900-01-01";

// Initials for the avatar fallback: at most two letters, from the first
// and last word. An email address has no words to speak of, so
// everything before the @ counts as one - "rickard.hjerpe@..." gives "R"
// rather than "R@". Shared so mobile and web derive the same letters.
export function initialsFor(name: string): string {
  const cleaned = name.split("@")[0]!.replace(/[._-]+/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

// A Postgres `date` is a calendar day with no timezone, and that is the
// whole difficulty here. `new Date("1990-05-17")` parses as UTC
// midnight, which is the 16th in any timezone west of Greenwich - so
// both directions are done by hand on the local calendar instead.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Splits a `YYYY-MM-DD` string into calendar parts, rejecting anything
// that is not a real day. The round-trip through Date catches
// "2025-02-30", which the regex is happy with and which Date would
// otherwise silently roll forward to March 2nd.
function parseParts(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

// The `date` column value for a day the user picked. Uses the local
// calendar fields, never toISOString(): a birthday picked at 01:00 in
// Stockholm is the previous day in UTC.
export function toDateOnlyString(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The other direction, for handing a stored date to a date picker.
// Noon, not midnight: a DST transition that skips midnight would push
// the date to the next day, and only the calendar day is meaningful
// here anyway.
export function parseDateOnly(value: string): Date | null {
  const parts = parseParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

// Completed years. Null for anything that is not a real past date, so
// the caller can simply not render a line rather than show "-1 år".
export function calculateAge(
  birthDate: string,
  now: Date = new Date(),
): number | null {
  const parts = parseParts(birthDate);
  if (!parts) return null;

  const hadBirthdayThisYear =
    now.getMonth() > parts.month - 1 ||
    // A February 29th birthday has no anniversary in a common year, so
    // the day-of-month comparison rolls it over on March 1st. Turning a
    // year older on the 1st is the convention Sweden uses.
    (now.getMonth() === parts.month - 1 && now.getDate() >= parts.day);

  const age = now.getFullYear() - parts.year - (hadBirthdayThisYear ? 0 : 1);
  return age < 0 ? null : age;
}
