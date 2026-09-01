// Svensk presentation av träningssiffror. Speglar hjälparna i mobilens
// skärmar (ProfileScreen m.fl.) - samma avvägningar, se kommentarerna
// där. formatDuration bor numera i packages/shared och re-exporteras här
// så anropssidorna kan fortsätta importera från ../lib/format.
// Enhetsmedveten formatering bor numera i packages/shared (delas med
// mobilen). Re-exporteras här så anropssidorna kan fortsätta importera
// från ../lib/format - de skickar nu ett unit-argument från useUnit().
export {
  formatDuration,
  formatHeight,
  formatTotalVolume,
  formatVolume,
  formatWeight,
  formatWeightValue,
  toDisplayWeight,
  unitLabel,
} from "@counter/shared";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} ${date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    month: "long",
    year: "numeric",
  });
}

export function formatWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
  });
}
