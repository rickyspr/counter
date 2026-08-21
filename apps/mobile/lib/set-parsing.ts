// Rad-först-inmatningens gemensamma delar, delade av det pågående
// passet (ActiveWorkoutScreen) och redigeringen av ett avslutat pass
// (EditWorkoutScreen). Rena funktioner utan beroenden - all
// state-hantering ligger kvar i respektive skärm.

// En rad skapas av "Lägg till set" innan den fyllts i, så den finns
// bara i state tills BÅDA fälten är giltiga - då skrivs den. `saved` är
// hela skillnaden: null betyder att raden aldrig skrivits någonstans,
// annars är det senast sparade värdet. Att skriva en 0×0-rad direkt vid
// knapptrycket hade gått igenom tabellens check-villkor och blivit
// skräp i statistiken om raden aldrig fylldes i.
export interface LoggedSet {
  id: string;
  setNr: number;
  repsDraft: string;
  weightDraft: string;
  saved: { reps: number; weightKg: number } | null;
}

// Number("") är 0, så tomma fält måste avvisas explicit. Komma
// accepteras som decimaltecken eftersom UI-språket är svenska.
export function parseAmount(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

// reps är en int-kolumn i Postgres - ett decimaltal skulle avvisas av
// servern långt senare, när synk-kön spelas upp.
export function parseReps(value: string): number | null {
  const parsed = parseAmount(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

export function parseSetDrafts(
  set: LoggedSet,
): { reps: number; weightKg: number } | null {
  const reps = parseReps(set.repsDraft);
  const weightKg = parseAmount(set.weightDraft);
  if (reps === null || weightKg === null) return null;
  return { reps, weightKg };
}

// Sant när raden inte skiljer sig från det som redan ligger sparat -
// då finns det ingenting att skriva. Anropas både vid blur och vid
// avslut/klar.
export function isUnchanged(
  set: LoggedSet,
  parsed: { reps: number; weightKg: number },
): boolean {
  return (
    set.saved !== null &&
    parsed.reps === set.saved.reps &&
    parsed.weightKg === set.saved.weightKg
  );
}
