// Rad-först-inmatningens gemensamma delar, delade av det pågående
// passet (ActiveWorkoutScreen) och redigeringen av ett avslutat pass
// (EditWorkoutScreen). Rena funktioner utan beroenden - all
// state-hantering ligger kvar i respektive skärm.

import {
  parseAmount,
  parseWeightInput,
  weightInputValue,
  type Unit,
} from "@counter/shared";

// parseAmount bor numera i packages/shared (webben delar den via
// CSV-exporten) och re-exporteras här så anropssidorna kan fortsätta
// importera från ../lib/set-parsing.
export { parseAmount };

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

// reps är en int-kolumn i Postgres - ett decimaltal skulle avvisas av
// servern långt senare, när synk-kön spelas upp.
export function parseReps(value: string): number | null {
  const parsed = parseAmount(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

// weightDraft är text i användarens enhet; det som returneras (och
// skrivs) är alltid KG med full precision.
export function parseSetDrafts(
  set: LoggedSet,
  unit: Unit,
): { reps: number; weightKg: number } | null {
  const reps = parseReps(set.repsDraft);
  const weightKg = parseWeightInput(set.weightDraft, unit);
  if (reps === null || weightKg === null) return null;
  return { reps, weightKg };
}

// Sant när raden inte skiljer sig från det som redan ligger sparat -
// då finns det ingenting att skriva. Anropas både vid blur och vid
// avslut/klar.
//
// Vikten jämförs via sin textrepresentation i användarens enhet, inte
// med === på kg: i lbs-läge är det inmatade talet avrundat till en
// decimal, så tur och retur genom lbs->kg->lbs ger ett minimalt annat
// kg-tal än det sparade. En === hade sett varje blur som en ändring och
// skrivit om gamla set med avrundningsbrus.
export function isUnchanged(
  set: LoggedSet,
  parsed: { reps: number; weightKg: number },
  unit: Unit,
): boolean {
  return (
    set.saved !== null &&
    parsed.reps === set.saved.reps &&
    weightInputValue(parsed.weightKg, unit) ===
      weightInputValue(set.saved.weightKg, unit)
  );
}
