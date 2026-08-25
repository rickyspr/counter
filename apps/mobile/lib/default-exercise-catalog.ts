// Speglar exakt raderna i
// supabase/migrations/20260825090000_seed_global_exercises.sql. Paketerad
// i appen som sista utväg när katalogen aldrig hunnit hämtas eller cachas
// från servern - annars finns ingenting att välja på en helt ny
// installation utan nät. Håll i synk med migrationen för hand; den ändras
// sällan.
export interface DefaultExercise {
  name: string;
  muscle_group: string;
}

export const DEFAULT_EXERCISE_CATALOG: DefaultExercise[] = [
  { name: "Bänkpress", muscle_group: "bröst" },
  { name: "Lutande bänkpress", muscle_group: "bröst" },
  { name: "Hantelpress", muscle_group: "bröst" },
  { name: "Cable crossover", muscle_group: "bröst" },
  { name: "Marklyft", muscle_group: "rygg" },
  { name: "Rodd med skivstång", muscle_group: "rygg" },
  { name: "Sittande rodd", muscle_group: "rygg" },
  { name: "Latsdrag", muscle_group: "rygg" },
  { name: "Pull-ups", muscle_group: "rygg" },
  { name: "Knäböj", muscle_group: "ben" },
  { name: "Frontböj", muscle_group: "ben" },
  { name: "Benpress", muscle_group: "ben" },
  { name: "Utfallssteg", muscle_group: "ben" },
  { name: "Rumänska marklyft", muscle_group: "ben" },
  { name: "Vadpress", muscle_group: "ben" },
  { name: "Militärpress", muscle_group: "axlar" },
  { name: "Axelpress med hantlar", muscle_group: "axlar" },
  { name: "Sidolyft", muscle_group: "axlar" },
  { name: "Bakåtdelt", muscle_group: "axlar" },
  { name: "Bicepscurl", muscle_group: "armar" },
  { name: "Hammercurl", muscle_group: "armar" },
  { name: "Triceps pushdown", muscle_group: "armar" },
  { name: "Franska pressar", muscle_group: "armar" },
  { name: "Plankan", muscle_group: "core" },
  { name: "Situps", muscle_group: "core" },
  { name: "Hanging leg raise", muscle_group: "core" },
];
