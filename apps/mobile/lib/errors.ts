// What to show the user when something threw.
//
// `err instanceof Error` is not enough, and the gap is not academic: a
// PostgrestError from supabase-js is a PLAIN OBJECT ({ message, code,
// details, hint }), not an Error subclass. Every `err instanceof Error
// ? err.message : "Okänt fel."` therefore turns the one sentence that
// explains the failure - "column profiles.avatar_path does not exist" -
// into "Okänt fel.", which is precisely when the user needs it most.
//
// StorageError and AuthError DO extend Error, so both shapes turn up
// depending on which client was called.

interface MessageLike {
  message: string;
  code?: unknown;
}

function isMessageLike(value: unknown): value is MessageLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

export function errorMessage(err: unknown, fallback = "Okänt fel."): string {
  if (typeof err === "string" && err.trim() !== "") return err;
  if (!isMessageLike(err)) return fallback;
  if (err.message.trim() === "") return fallback;

  // The code is carried along when there is one. RepCount talks to
  // Postgres directly, so "42703" or "23514" is often the fastest way
  // to tell a schema problem from a rejected value.
  const code =
    typeof err.code === "string" || typeof err.code === "number"
      ? ` (${err.code})`
      : "";
  return `${err.message}${code}`;
}
