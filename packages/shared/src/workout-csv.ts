import { toLocalDateOnly, toLocalTimeOnly } from "./local-time";
import type { WorkoutHistoryEntry } from "./data/workout-history";
import type { Unit } from "./types";
import { kgToLbs } from "./units";

// Ren, enhetstestad CSV-generering för träningsexporten. Ligger i
// packages/shared så en framtida mobil-export eller ett JSON-format ärver
// samma kolumndefinition - COLUMNS nedan är den enda källan.
//
// Ingen formelinjektionsprefixning (=/+/-/@): filen innehåller bara
// användarens egen data som hen själv matat in, laddas ner av samma
// användare, och en prefixad cell vore fel i varje icke-Excel-verktyg.

export const CSV_DELIMITER = ";"; // svenskt Excel läser systemets listavgränsare
export const CSV_NEWLINE = "\r\n"; // RFC 4180
export const UTF8_BOM = "﻿"; // utan den läser Excel åäö som mojibake

export interface WorkoutExportRow {
  date: string; // lokal YYYY-MM-DD
  startTime: string; // lokal HH:MM
  endTime: string; // lokal HH:MM, "" om ended_at saknas
  durationMinutes: number | null;
  workoutName: string; // "" när name är null
  exerciseName: string;
  muscleGroup: string; // "" när null/undefined
  setNr: number; // POSITION i övningen, 1-baserad
  reps: number;
  weightKg: number;
  volumeKg: number;
}

// toFixed(3) + trimma avslutande nollor och en ensam punkt, sedan "." -> ",".
// Flyttalsbrus: 12 * 6.9 = 82.80000000000001, som annars läckt ut i filen.
// Trimningen sker bara EFTER en punkt, så "100" förblir "100".
function formatDecimal(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  let s = n.toFixed(3);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s.replace(".", ",");
}

// Kolumnerna beror på enheten: vikt- och volymkolumnen byter både
// rubrik (weight_kg -> weight_lbs) och värde (konverteras till lbs före
// formateringen). Allt annat är enhetsoberoende. WorkoutExportRow bär
// fortfarande kg - konverteringen sker bara på väg ut i filen.
function columnsFor(unit: Unit): readonly {
  header: string;
  value: (row: WorkoutExportRow) => string;
}[] {
  const suffix = unit === "lbs" ? "lbs" : "kg";
  const toUnit = (kg: number) => (unit === "lbs" ? kgToLbs(kg) : kg);
  return [
    { header: "date", value: (r) => r.date },
    { header: "start_time", value: (r) => r.startTime },
    { header: "end_time", value: (r) => r.endTime },
    {
      header: "duration_min",
      value: (r) =>
        r.durationMinutes === null ? "" : String(r.durationMinutes),
    },
    { header: "workout_name", value: (r) => r.workoutName },
    { header: "exercise_name", value: (r) => r.exerciseName },
    { header: "muscle_group", value: (r) => r.muscleGroup },
    { header: "set_nr", value: (r) => String(r.setNr) },
    { header: "reps", value: (r) => String(r.reps) },
    { header: `weight_${suffix}`, value: (r) => formatDecimal(toUnit(r.weightKg)) },
    { header: `volume_${suffix}`, value: (r) => formatDecimal(toUnit(r.volumeKg)) },
  ];
}

export function workoutCsvHeaders(unit: Unit): readonly string[] {
  return columnsFor(unit).map((c) => c.header);
}

// Citera BARA när fältet innehåller ", ;, CR eller LF; inre citattecken
// dubbleras. Komma citeras INTE - teckenklassen är kopplad till
// CSV_DELIMITER.
export function escapeCsvField(value: string): string {
  if (/["\r\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Övning utan set och pass utan övningar ger noll rader.
export function toExportRows(entry: WorkoutHistoryEntry): WorkoutExportRow[] {
  const date = toLocalDateOnly(entry.startedAt);
  const startTime = toLocalTimeOnly(entry.startedAt);
  const endTime = entry.endedAt ? toLocalTimeOnly(entry.endedAt) : "";
  const workoutName = entry.name ?? "";
  const durationMinutes = entry.summary.durationMinutes;

  return entry.exercises.flatMap((ex) =>
    ex.sets.map((set, i) => ({
      date,
      startTime,
      endTime,
      durationMinutes,
      workoutName,
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup ?? "",
      setNr: i + 1,
      reps: set.reps,
      weightKg: set.weightKg,
      volumeKg: set.reps * set.weightKg,
    })),
  );
}

// BOM + rubrikrad + en rad per WorkoutExportRow. Alla fält genom
// escapeCsvField, CSV_DELIMITER emellan, CSV_NEWLINE efter varje rad
// (filen slutar med en radbrytning).
export function serializeWorkoutCsv(
  rows: WorkoutExportRow[],
  unit: Unit,
): string {
  const columns = columnsFor(unit);
  const lines = [
    columns.map((c) => escapeCsvField(c.header)).join(CSV_DELIMITER),
  ];
  for (const row of rows) {
    lines.push(
      columns.map((c) => escapeCsvField(c.value(row))).join(CSV_DELIMITER),
    );
  }
  return UTF8_BOM + lines.map((l) => l + CSV_NEWLINE).join("");
}

export function workoutCsvFileName(fromDate: string, toDate: string): string {
  return `counter-traningsdata-${fromDate}--${toDate}.csv`;
}
