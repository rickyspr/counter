// Svensk presentation av träningssiffror. Speglar hjälparna i mobilens
// skärmar (ProfileScreen m.fl.) - samma avvägningar, se kommentarerna
// där.

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
