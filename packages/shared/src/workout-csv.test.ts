import { describe, expect, it } from "vitest";
import type { WorkoutHistoryEntry } from "./data/workout-history";
import {
  escapeCsvField,
  serializeWorkoutCsv,
  toExportRows,
  UTF8_BOM,
  workoutCsvFileName,
  type WorkoutExportRow,
} from "./workout-csv";

const HEADER =
  "date;start_time;end_time;duration_min;workout_name;exercise_name;muscle_group;set_nr;reps;weight_kg;volume_kg";

function row(overrides: Partial<WorkoutExportRow> = {}): WorkoutExportRow {
  return {
    date: "2026-08-30",
    startTime: "18:05",
    endTime: "19:10",
    durationMinutes: 65,
    workoutName: "Benpass",
    exerciseName: "Knäböj",
    muscleGroup: "Ben",
    setNr: 1,
    reps: 5,
    weightKg: 100,
    volumeKg: 500,
    ...overrides,
  };
}

function entry(overrides: Partial<WorkoutHistoryEntry> = {}): WorkoutHistoryEntry {
  return {
    id: "w1",
    name: "Benpass",
    startedAt: new Date(2026, 7, 30, 18, 5).toISOString(),
    endedAt: new Date(2026, 7, 30, 19, 10).toISOString(),
    summary: {
      totalVolumeKg: 0,
      setCount: 0,
      exerciseCount: 0,
      durationMinutes: 65,
    },
    exercises: [],
    media: [],
    kudosCount: 0,
    ...overrides,
  };
}

describe("serializeWorkoutCsv", () => {
  it("1. has the exact header row", () => {
    const csv = serializeWorkoutCsv([]);
    expect(csv.slice(UTF8_BOM.length).split("\r\n")[0]).toBe(HEADER);
  });

  it("2. starts with the BOM immediately followed by the header", () => {
    const csv = serializeWorkoutCsv([]);
    expect(csv.startsWith(UTF8_BOM + HEADER)).toBe(true);
  });

  it("3. terminates every row with CRLF, including the last", () => {
    const csv = serializeWorkoutCsv([row()]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.slice(UTF8_BOM.length).split("\r\n")).toHaveLength(3);
  });

  it("4. empty row list -> BOM + header + CRLF and nothing more", () => {
    expect(serializeWorkoutCsv([])).toBe(UTF8_BOM + HEADER + "\r\n");
  });

  it("11. formats decimals with a comma", () => {
    const line = (weightKg: number) =>
      serializeWorkoutCsv([row({ weightKg, volumeKg: 0 })])
        .split("\r\n")[1]!
        .split(";")[9];
    expect(line(22.5)).toBe("22,5");
    expect(line(100)).toBe("100");
    expect(line(62.25)).toBe("62,25");
    expect(line(0)).toBe("0");
  });

  it("12. floating point noise does not leak into volume_kg", () => {
    const rows = toExportRows(
      entry({
        exercises: [
          { workoutExerciseId: "we1", name: "Knäböj", sets: [{ reps: 12, weightKg: 6.9 }] },
        ],
      }),
    );
    const volume = serializeWorkoutCsv(rows).split("\r\n")[1]!.split(";")[10];
    expect(volume).toBe("82,8");
  });

  it("13. null duration -> empty field", () => {
    const field = serializeWorkoutCsv([row({ durationMinutes: null })])
      .split("\r\n")[1]!
      .split(";")[3];
    expect(field).toBe("");
  });

  it("22. a semicolon in the workout name survives serialization", () => {
    const line = serializeWorkoutCsv([row({ workoutName: "Ben; och rygg" })]).split(
      "\r\n",
    )[1]!;
    expect(line).toContain('"Ben; och rygg"');
  });
});

describe("escapeCsvField", () => {
  it("5. leaves a plain field untouched", () => {
    expect(escapeCsvField("Benpass")).toBe("Benpass");
  });
  it("6. quotes a field with a semicolon", () => {
    expect(escapeCsvField("Ben;pass")).toBe('"Ben;pass"');
  });
  it("7. doubles inner quotes", () => {
    expect(escapeCsvField('Han sa "kör"')).toBe('"Han sa ""kör"""');
  });
  it("8. quotes a field with a newline and keeps the break", () => {
    expect(escapeCsvField("Rad1\nRad2")).toBe('"Rad1\nRad2"');
  });
  it("9. does not quote a field with a comma", () => {
    expect(escapeCsvField("Bänk, snett")).toBe("Bänk, snett");
  });
  it("10. leaves an empty string as an unquoted empty string", () => {
    expect(escapeCsvField("")).toBe("");
  });
});

describe("toExportRows", () => {
  it("14. 2 exercises x 3 sets -> 6 rows, set_nr 1..3 per exercise", () => {
    const sets = [
      { reps: 5, weightKg: 100 },
      { reps: 5, weightKg: 100 },
      { reps: 5, weightKg: 100 },
    ];
    const rows = toExportRows(
      entry({
        exercises: [
          { workoutExerciseId: "a", name: "Knäböj", sets },
          { workoutExerciseId: "b", name: "Marklyft", sets },
        ],
      }),
    );
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.setNr)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("15. name null -> workoutName empty", () => {
    const rows = toExportRows(
      entry({
        name: null,
        exercises: [
          { workoutExerciseId: "a", name: "Knäböj", sets: [{ reps: 5, weightKg: 100 }] },
        ],
      }),
    );
    expect(rows[0]!.workoutName).toBe("");
  });

  it("16. muscleGroup undefined and null both become empty", () => {
    const rows = toExportRows(
      entry({
        exercises: [
          { workoutExerciseId: "a", name: "Knäböj", muscleGroup: undefined, sets: [{ reps: 5, weightKg: 100 }] },
          { workoutExerciseId: "b", name: "Marklyft", muscleGroup: null, sets: [{ reps: 5, weightKg: 100 }] },
        ],
      }),
    );
    expect(rows[0]!.muscleGroup).toBe("");
    expect(rows[1]!.muscleGroup).toBe("");
  });

  it("17. endedAt null -> endTime empty", () => {
    const rows = toExportRows(
      entry({
        endedAt: null,
        exercises: [
          { workoutExerciseId: "a", name: "Knäböj", sets: [{ reps: 5, weightKg: 100 }] },
        ],
      }),
    );
    expect(rows[0]!.endTime).toBe("");
  });

  it("18. exercise with no sets and workout with no exercises -> zero rows", () => {
    expect(
      toExportRows(
        entry({
          exercises: [{ workoutExerciseId: "a", name: "Knäböj", sets: [] }],
        }),
      ),
    ).toHaveLength(0);
    expect(toExportRows(entry({ exercises: [] }))).toHaveLength(0);
  });

  it("19. date and time are local", () => {
    const rows = toExportRows(
      entry({
        startedAt: new Date(2026, 7, 30, 18, 5).toISOString(),
        exercises: [
          { workoutExerciseId: "a", name: "Knäböj", sets: [{ reps: 5, weightKg: 100 }] },
        ],
      }),
    );
    expect(rows[0]!.date).toBe("2026-08-30");
    expect(rows[0]!.startTime).toBe("18:05");
  });

  it("20. volumeKg === reps * weightKg", () => {
    const rows = toExportRows(
      entry({
        exercises: [
          { workoutExerciseId: "a", name: "Knäböj", sets: [{ reps: 8, weightKg: 60 }] },
        ],
      }),
    );
    expect(rows[0]!.volumeKg).toBe(480);
  });
});

describe("workoutCsvFileName", () => {
  it("21. produces the exact string", () => {
    expect(workoutCsvFileName("2024-01-01", "2026-08-30")).toBe(
      "counter-traningsdata-2024-01-01--2026-08-30.csv",
    );
  });
});
