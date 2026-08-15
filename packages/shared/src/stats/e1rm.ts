// Epley-formeln för estimerat 1RM. Vid 1 rep är e1RM = vikten själv.
export function calculateE1rm(set: { reps: number; weight_kg: number }): number {
  if (set.reps <= 1) {
    return set.weight_kg;
  }
  return set.weight_kg * (1 + set.reps / 30);
}
