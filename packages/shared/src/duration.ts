// Tidsformatering på ett ställe. Två funktioner med medvetet olika
// avrundning: formatDuration RUNDAR inuti sig själv (en färdig varaktighet
// visas till närmaste minut), medan elapsedMinutes GOLVAR (ett pass som
// pågått i 44 sekunder är "igång i 0 min", inte "1 min"). Håll de två
// stegen isär - att golva innan formatDuration hade dolt round-regeln,
// att runda i elapsedMinutes hade fått en nystartad timer att hoppa till
// 1 min efter 31 sekunder.

// Total tid blir snabbt hundratals minuter, vilket ingen läser som tid.
// Minuterna behålls: Math.round(minuter / 60) hade gjort ett enda
// 90-minuterspass till "2 h".
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// Hela minuter mellan startedAt och now (default nu), golvade och klampade
// till 0 vid negativt värde eller NaN. now är injicerbar för test.
export function elapsedMinutes(startedAt: string | Date, now: Date = new Date()): number {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const diffMs = now.getTime() - start.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (Number.isNaN(minutes) || minutes < 0) return 0;
  return minutes;
}
