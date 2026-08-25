// Samma grupper som seedas i supabase/migrations/20260825090000_seed_global_exercises.sql.
// muscle_group är fri text i databasen - listan här är bara ett UI-genvägsval
// så att egna övningar hamnar i samma grupper som katalogen, istället för att
// splittras i varianter ("Ben" vs "ben" vs "legs").
export const MUSCLE_GROUPS = ["bröst", "rygg", "ben", "axlar", "armar", "core"] as const;
