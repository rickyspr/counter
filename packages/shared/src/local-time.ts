// Lokal-tid-hjälpare för CSV-exporten. All datum/tid i exportfilen ska
// vara den tid användaren faktiskt tränade på, alltså klientens lokala
// tidszon - aldrig UTC.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// "2026-08-30" ur ett ögonblick, i lokal tid (inte UTC).
export function toLocalDateOnly(instant: string | Date): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "18:05" ur ett ögonblick, i lokal tid.
export function toLocalTimeOnly(instant: string | Date): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Delar upp "2026-08-30" i [år, månad, dag]. noUncheckedIndexedAccess är
// på, så delarna är string | undefined - en NaN efter Number() betyder
// ogiltig indata och kastar.
function parseDateOnly(dateOnly: string): [number, number, number] {
  const parts = dateOnly.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error(`Invalid date-only string: ${JSON.stringify(dateOnly)}`);
  }
  return [year, month, day];
}

// ISO för lokal midnatt på det givna datumet.
// Får INTE göra new Date(dateOnly): en bar "2026-08-30" tolkas som
// UTC-midnatt, vilket i svensk sommartid blir 02:00 lokal tid. Datumet
// byggs av sina delar med new Date(year, month - 1, day), som ger
// korrekt lokal midnatt även på DST-omställningsdygn.
export function localDayStartIso(dateOnly: string): string {
  const [year, month, day] = parseDateOnly(dateOnly);
  return new Date(year, month - 1, day).toISOString();
}

// ISO för NÄSTA lokala midnatt - exklusiv övre gräns, vald framför lte
// på 23:59:59.999 pga timestamptz mikrosekundsupplösning. JS normaliserar
// day + 1 över månads-/årsgräns av sig självt.
export function localDayEndExclusiveIso(dateOnly: string): string {
  const [year, month, day] = parseDateOnly(dateOnly);
  return new Date(year, month - 1, day + 1).toISOString();
}
