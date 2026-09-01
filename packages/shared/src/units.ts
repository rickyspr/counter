import type { Unit } from "./types";

// All enhetslogik på ett ställe. kg är det ENDA som lagras (numeric i
// Postgres); lbs och fot/tum är presentation och inmatning ovanpå det.
// Preferensen är egentligen "imperial vs metriskt" - kroppslängd följer
// med som fot/tum - men den heter efter vikten eftersom det är där den
// syns oftast och det är kolumnen `profiles.unit` som bär den.

export type { Unit } from "./types";

export const KG_PER_LB = 0.45359237; // exakt, per internationell definition

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

export function unitLabel(unit: Unit): string {
  return unit === "lbs" ? "lbs" : "kg";
}

// Talet som ska visas för användaren i vald enhet. kg orört (lagrat
// värde), lbs avrundat till en decimal - mer precision än så är brus
// från konverteringen.
export function toDisplayWeight(kg: number, unit: Unit): number {
  if (unit === "lbs") return Math.round(kgToLbs(kg) * 10) / 10;
  return kg;
}

// Bara talet, formaterat svenskt. kg behåller dagens beteende (upp till
// tre decimaler, lagrat värde orört); lbs en decimal.
export function formatWeightValue(kg: number, unit: Unit): string {
  if (unit === "lbs") {
    return toDisplayWeight(kg, "lbs").toLocaleString("sv-SE", {
      maximumFractionDigits: 1,
    });
  }
  return kg.toLocaleString("sv-SE", { maximumFractionDigits: 3 });
}

export function formatWeight(kg: number, unit: Unit): string {
  return `${formatWeightValue(kg, unit)} ${unitLabel(unit)}`;
}

// Volym avrundas till hela enheter i båda lägena (matchar webbens
// Math.round). I lbs räknas avrundningen på lbs-talet.
export function formatVolume(kg: number, unit: Unit): string {
  const value = unit === "lbs" ? kgToLbs(kg) : kg;
  return `${Math.round(value).toLocaleString("sv-SE")} ${unitLabel(unit)}`;
}

// Livstidsvolym hamnar i tiotusentals. "ton" är läsbart i kg; i lbs
// finns inget kort ord, så ett "k"-suffix (tusental) används istället,
// med en egen tröskel eftersom 10 000 kg ≈ 22 000 lbs.
export function formatTotalVolume(kg: number, unit: Unit): string {
  if (unit === "lbs") {
    const lbs = kgToLbs(kg);
    if (lbs >= 20000) {
      return `${(lbs / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })}k lbs`;
    }
    return `${Math.round(lbs).toLocaleString("sv-SE")} lbs`;
  }
  if (kg >= 10000) {
    return `${(kg / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ton`;
  }
  return `${Math.round(kg).toLocaleString("sv-SE")} kg`;
}

// Vad ett viktfält förifylls med: talet i vald enhet, med komma som
// decimaltecken (svenskt UI). kg orört, lbs via toDisplayWeight.
export function weightInputValue(kg: number, unit: Unit): string {
  const value = unit === "lbs" ? toDisplayWeight(kg, "lbs") : kg;
  return String(value).replace(".", ",");
}

// Number("") är 0, så tomma fält måste avvisas explicit. Komma
// accepteras som decimaltecken eftersom UI-språket är svenska.
// Flyttad hit från apps/mobile/lib/set-parsing.ts så webben kan dela.
export function parseAmount(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

// Text i användarens enhet -> KG med full precision (ingen avrundning,
// så tur-och-retur genom weightInputValue är stabilt).
export function parseWeightInput(text: string, unit: Unit): number | null {
  const amount = parseAmount(text);
  if (amount === null) return null;
  return unit === "lbs" ? lbsToKg(amount) : amount;
}

export interface LocaleHint {
  regionCode?: string | null;
  measurementSystem?: string | null;
}

// Regionsdefault, satt EN gång utan onboarding-fråga. lbs bara för USA
// (regionCode "US", skiftlägesokänsligt) eller ett explicit "us"
// measurementSystem. Storbritannien är INTE med: de väger sig i stone
// och kör mile på vägen men gymmet är metriskt, så kg är rätt gissning
// där. En felgissning är ett tryck bort i Inställningar.
export function defaultUnitForLocale(
  locale: LocaleHint | null | undefined,
): Unit {
  if (!locale) return "kg";
  if (locale.regionCode && locale.regionCode.toUpperCase() === "US") return "lbs";
  if (locale.measurementSystem === "us") return "lbs";
  return "kg";
}

// Avrunda till hela centimeter FÖRST, annars ger 182,9 cm 5'12".
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / 2.54);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

// Anroparen avrundar till heltal för height_cm.
export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function formatHeight(cm: number, unit: Unit): string {
  if (unit === "lbs") {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${cm} cm`;
}
