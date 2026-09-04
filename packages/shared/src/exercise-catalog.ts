// Övningskatalogen: en rad per övning, global (user_id null) eller
// användarens egen. dedupeExerciseCatalog() städar bort dubbletter i
// klienten - komplement till den unika constrainten på globala rader i
// 20260904090000_dedupe_global_exercises.sql, som förhindrar att nya
// dubbletter uppstår men inte rättar en cache som redan hann läsa in
// gamla, dubblerade rader.

export interface ExerciseOption {
  id: string;
  name: string;
  muscle_group: string | null;
  // null = global övning, en sträng = användarens egen, undefined = okänt
  // ursprung (t.ex. en gammal cache-post skriven innan user_id fanns med
  // i selecten).
  user_id?: string | null;
  // Sant bara för rader ur DEFAULT_EXERCISE_CATALOG som aldrig nått
  // servern - ExercisePicker måste skapa en riktig rad (via onCreate)
  // innan en sådan post faktiskt används i ett pass.
  fallback?: boolean;
}

// Den enda definitionen av namn-normaliseringen i klientkoden. Speglas i
// ord av SQL:ens lower(btrim(name)) i dedupe-migrationen - de två lagren
// måste vara bevisligen överens.
export function exerciseNameKey(name: string): string {
  return name.trim().toLowerCase();
}

// Rang för att avgöra vilken post som vinner vid namnkrock: en global rad
// vinner alltid över en egen kopia, en fallback-post förlorar alltid.
function rank(exercise: ExerciseOption): number {
  if (exercise.fallback === true) return 0;
  if (exercise.user_id === null) return 2;
  return 1; // egen rad, eller user_id undefined (gammal cache)
}

// Slår ihop poster med samma namn (skiftlägesokänsligt, blanksteg
// trimmat) till en. Utordningen är varje namn-nyckels FÖRSTA förekomst i
// indata - katalogen kommer redan sorterad på (muscle_group, name) och
// den ordningen ska inte kastas om. Vilken POST som representerar nyckeln
// avgörs separat av rank(): en global rad vinner alltid, även om den kom
// senare i indata.
//
// Muterar aldrig indata. Släpper tyst poster vars name inte är en
// icke-tom sträng efter trim - funktionen körs även på data lästa från
// AsyncStorage via en ovaliderad cast (samma mönster som parseStored i
// active-workout.ts), och utan den här spärren kraschar ett anrop på
// skräpdata på disk.
export function dedupeExerciseCatalog(
  catalog: ExerciseOption[],
): ExerciseOption[] {
  const order: string[] = [];
  const winners = new Map<string, ExerciseOption>();

  for (const exercise of catalog) {
    if (typeof exercise.name !== "string") continue;
    const key = exerciseNameKey(exercise.name);
    if (!key) continue;

    const existing = winners.get(key);
    if (!existing) {
      order.push(key);
      winners.set(key, exercise);
      continue;
    }
    if (rank(exercise) > rank(existing)) {
      winners.set(key, exercise);
    }
  }

  return order.map((key) => winners.get(key)!);
}
