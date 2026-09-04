import { describe, expect, it } from "vitest";
import { dedupeExerciseCatalog, type ExerciseOption } from "./exercise-catalog";

describe("dedupeExerciseCatalog", () => {
  it("keeps one row when two identical global rows exist, first wins", () => {
    const catalog: ExerciseOption[] = [
      { id: "a", name: "Bänkpress", muscle_group: "bröst", user_id: null },
      { id: "b", name: "Bänkpress", muscle_group: "bröst", user_id: null },
    ];
    const result = dedupeExerciseCatalog(catalog);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a");
  });

  it("treats different casing and surrounding whitespace as the same key", () => {
    const catalog: ExerciseOption[] = [
      { id: "a", name: "Bänkpress", muscle_group: "bröst", user_id: null },
      { id: "b", name: " bänkpress ", muscle_group: "bröst", user_id: null },
    ];
    const result = dedupeExerciseCatalog(catalog);
    expect(result).toHaveLength(1);
  });

  it("lets the global row win over the user's own copy, in both orders", () => {
    const global: ExerciseOption = {
      id: "global",
      name: "Marklyft",
      muscle_group: "rygg",
      user_id: null,
    };
    const own: ExerciseOption = {
      id: "own",
      name: "Marklyft",
      muscle_group: "rygg",
      user_id: "user-1",
    };

    expect(dedupeExerciseCatalog([global, own])[0]!.id).toBe("global");
    expect(dedupeExerciseCatalog([own, global])[0]!.id).toBe("global");
  });

  it("lets a real row win over a fallback row with the same name", () => {
    const fallback: ExerciseOption = {
      id: "default:0",
      name: "Knäböj",
      muscle_group: "ben",
      fallback: true,
    };
    const real: ExerciseOption = {
      id: "real",
      name: "Knäböj",
      muscle_group: "ben",
      user_id: null,
    };
    const result = dedupeExerciseCatalog([fallback, real]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("real");
    expect(result[0]!.fallback).not.toBe(true);
  });

  it("does not crash on rows without a user_id field, first wins, order kept", () => {
    const catalog: ExerciseOption[] = [
      { id: "a", name: "Axelpress", muscle_group: "axlar" },
      { id: "b", name: "Axelpress", muscle_group: "axlar" },
      { id: "c", name: "Rodd", muscle_group: "rygg" },
    ];
    const result = dedupeExerciseCatalog(catalog);
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("returns the same elements in the same order when there are no duplicates", () => {
    const catalog: ExerciseOption[] = [
      { id: "a", name: "Axelpress", muscle_group: "axlar", user_id: null },
      { id: "b", name: "Bänkpress", muscle_group: "bröst", user_id: null },
      { id: "c", name: "Chins", muscle_group: "rygg", user_id: null },
    ];
    expect(dedupeExerciseCatalog(catalog)).toEqual(catalog);
  });

  it("silently drops a garbage entry with no name, keeps the rest", () => {
    const garbage = { id: "broken", muscle_group: null } as unknown as ExerciseOption;
    const catalog: ExerciseOption[] = [
      { id: "a", name: "Bänkpress", muscle_group: "bröst", user_id: null },
      garbage,
      { id: "b", name: "Rodd", muscle_group: "rygg", user_id: null },
    ];
    const result = dedupeExerciseCatalog(catalog);
    expect(result.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
