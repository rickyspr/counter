// Svensk presentation av träningssiffror. Speglar hjälparna i mobilens
// skärmar (ProfileScreen m.fl.) - samma avvägningar, se kommentarerna
// där. formatDuration bor numera i packages/shared och re-exporteras här
// så anropssidorna kan fortsätta importera från ../lib/format.
export { formatDuration } from "@counter/shared";

// Livstidsvolym hamnar i tiotusentals kg. Ton är läsbart, kg är det inte.
export function formatTotalVolume(kg: number): string {
  if (kg >= 10000) {
    return `${(kg / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ton`;
  }
  return `${Math.round(kg).toLocaleString("sv-SE")} kg`;
}

export function formatVolume(kg: number): string {
  return `${Math.round(kg).toLocaleString("sv-SE")} kg`;
}

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
