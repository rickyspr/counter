// Returnerar datumet (YYYY-MM-DD, UTC) för måndagen i samma ISO-vecka som
// den givna tidsstämpeln. Används för att gruppera pass per vecka.
export function isoWeekStart(dateIso: string): string {
  const date = new Date(dateIso);
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utcDate.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - diffToMonday);
  return utcDate.toISOString().slice(0, 10);
}
