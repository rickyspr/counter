import {
  summarizeWorkout,
  type SetRecord,
  type WorkoutSummary,
} from "@repcount/shared";
import * as Crypto from "expo-crypto";
import { enqueue } from "./offline-queue";
import { readJSON, writeJSON } from "./storage";
import { supabase } from "./supabase";

export interface ExerciseOption {
  id: string;
  name: string;
  muscle_group: string | null;
}

const EXERCISE_CACHE_KEY = "repcount:exercise-cache";
const PREVIOUS_SETS_CACHE_PREFIX = "repcount:previous-sets:";

// Övningskatalogen ändras sällan, så vi cachar den lokalt och faller
// tillbaka på cachen om nätverket är nere - annars går det inte att
// välja övning för ett pass som loggas helt offline. Delar samma
// pågående/klara hämtning mellan anropare inom sessionen (t.ex.
// hemskärmens uppvärmning och sedan pass-skärmens mount) istället
// för att hämta och skriva om cachen två gånger i rad.
let catalogPromise: Promise<ExerciseOption[]> | null = null;

export function fetchExerciseCatalog(): Promise<ExerciseOption[]> {
  if (!catalogPromise) {
    catalogPromise = loadExerciseCatalog().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
}

async function loadExerciseCatalog(): Promise<ExerciseOption[]> {
  try {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, muscle_group")
      .order("muscle_group", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    await writeJSON(EXERCISE_CACHE_KEY, data);
    return data;
  } catch (err) {
    const cached = await readJSON<ExerciseOption[] | null>(EXERCISE_CACHE_KEY, null);
    if (cached) return cached;
    throw err;
  }
}

// Mutationsfunktionerna nedan skriver ALDRIG direkt mot Supabase.
// De genererar ett lokalt id och lägger åtgärden i synk-kön (se
// offline-queue.ts). enqueue() väntar bara in det LOKALA sparandet
// (millisekunder) innan den returnerar - inte nätverkssynken, som
// sker i bakgrunden. Det gör att ett helt pass går att logga utan
// nätverk, samtidigt som varje steg är säkert sparat på disk innan
// appen tillåts stängas.

export async function startWorkout(
  userId: string,
): Promise<{ id: string; started_at: string }> {
  const id = Crypto.randomUUID();
  const started_at = new Date().toISOString();
  await enqueue({ type: "start_workout", id, user_id: userId, started_at });
  return { id, started_at };
}

export async function endWorkout(workoutId: string): Promise<{ ended_at: string }> {
  const ended_at = new Date().toISOString();
  await enqueue({ type: "end_workout", workout_id: workoutId, ended_at });
  return { ended_at };
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<{ id: string; exercise_id: string }> {
  const id = Crypto.randomUUID();
  await enqueue({
    type: "add_exercise",
    id,
    workout_id: workoutId,
    exercise_id: exerciseId,
    order_index: orderIndex,
  });
  return { id, exercise_id: exerciseId };
}

// Set-raden skapas i UI:t innan den fyllts i, så id:t måste finnas
// före första sparandet. Samma mönster som workouts/workout_exercises:
// klienten äger primärnyckeln.
export function newSetId(): string {
  return Crypto.randomUUID();
}

// Både att spara ett nytt set och att rätta ett befintligt är samma
// åtgärd: kön skickar en upsert, så samma id + set_nr skriver bara
// över reps/vikt. Fungerar oavsett om raden hunnit synkas eller
// fortfarande ligger kvar i kön.
export async function saveSet(
  setId: string,
  workoutExerciseId: string,
  setNr: number,
  reps: number,
  weightKg: number,
): Promise<void> {
  await enqueue({
    type: "add_set",
    id: setId,
    workout_exercise_id: workoutExerciseId,
    set_nr: setNr,
    reps,
    weight_kg: weightKg,
  });
}

export async function deleteSet(setId: string): Promise<void> {
  await enqueue({ type: "delete_set", id: setId });
}

export async function removeExerciseFromWorkout(
  workoutExerciseId: string,
): Promise<void> {
  await enqueue({ type: "delete_exercise", id: workoutExerciseId });
}

// Slänger ett pass helt: raden i workouts plus allt under den, via
// `on delete cascade`. Används när man avbryter ett pågående pass eller
// slänger ett återupptaget - aldrig för ett avslutat.
export async function deleteWorkout(workoutId: string): Promise<void> {
  await enqueue({ type: "delete_workout", workout_id: workoutId });
}

export interface PreviousSet {
  reps: number;
  weightKg: number;
}

// Skuggvärden till set-raderna: vad användaren körde på samma övning
// förra avslutade passet, så man kan sikta på att slå det. Rent stöd -
// misslyckas både nätet och cachen visas inga skuggvärden och INGET
// fel, eftersom det inte är data användaren matat in.
export async function fetchPreviousSetsForExercise(
  userId: string,
  exerciseId: string,
): Promise<PreviousSet[]> {
  const cacheKey = `${PREVIOUS_SETS_CACHE_PREFIX}${exerciseId}`;
  try {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        "started_at, workout_exercises!inner(order_index, exercise_id, sets(set_nr, reps, weight_kg))",
      )
      .eq("user_id", userId)
      .eq("workout_exercises.exercise_id", exerciseId)
      // Utesluter det pågående passet - det har inget ended_at än.
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    // Samma övning kan förekomma två gånger i ett pass; ta den första.
    const workoutExercise = [...(data?.workout_exercises ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    )[0];

    // set_nr kan ha luckor efter en borttagning, så sortera på set_nr
    // och använd sedan POSITION - rad 1 får första setet oavsett nummer.
    const sets: PreviousSet[] = [...(workoutExercise?.sets ?? [])]
      .sort((a, b) => a.set_nr - b.set_nr)
      .map((row) => ({ reps: row.reps, weightKg: row.weight_kg }));

    await writeJSON(cacheKey, sets);
    return sets;
  } catch {
    // Offline: falla tillbaka på det som hämtades senast appen hade nät.
    return readJSON<PreviousSet[]>(cacheKey, []);
  }
}

interface LatestWorkoutSummaryInput {
  workout: { started_at: string; ended_at: string | null };
  sets: SetRecord[];
}

// Hämtar det senast avslutade passet för en användare, samt alla dess set
// i det format som statistikfunktionerna i @repcount/shared förväntar sig.
// Kräver nätverk - se CLAUDE.md: offline-stödet täcker loggning, inte
// att bläddra i historik/statistik offline.
export async function fetchLatestWorkoutSummaryInput(
  userId: string,
): Promise<LatestWorkoutSummaryInput | null> {
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("id, started_at, ended_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) return null;

  const { data: workoutExercises, error: weError } = await supabase
    .from("workout_exercises")
    .select("id, exercise_id")
    .eq("workout_id", workout.id);
  if (weError) throw weError;

  if (!workoutExercises || workoutExercises.length === 0) {
    return { workout, sets: [] };
  }

  const exerciseByWorkoutExerciseId = new Map(
    workoutExercises.map((we) => [we.id, we.exercise_id]),
  );

  const { data: setRows, error: setsError } = await supabase
    .from("sets")
    .select("reps, weight_kg, workout_exercise_id")
    .in(
      "workout_exercise_id",
      workoutExercises.map((we) => we.id),
    );
  if (setsError) throw setsError;

  const sets: SetRecord[] = (setRows ?? []).map((row) => ({
    reps: row.reps,
    weight_kg: row.weight_kg,
    exercise_id: exerciseByWorkoutExerciseId.get(row.workout_exercise_id) ?? "",
    workout_id: workout.id,
    workout_started_at: workout.started_at,
  }));

  return { workout, sets };
}

export const WORKOUT_HISTORY_PAGE_SIZE = 20;

export interface HistoryExercise {
  workoutExerciseId: string;
  name: string;
  // I positionsordning. set_nr kan ha luckor efter en borttagning, så
  // raderna märks med sin POSITION i vyn - aldrig med set_nr.
  sets: { reps: number; weightKg: number }[];
}

export interface WorkoutHistoryEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  summary: WorkoutSummary;
  exercises: HistoryExercise[];
}

// En sida av passhistoriken, med alla set inbäddade i SAMMA anrop -
// samma mönster som fetchPreviousSetsForExercise ovan. Att setsen följer
// med direkt är hela poängen: detaljvyn behöver ingen egen fråga, utan
// renderar ur det som listan redan laddat.
//
// Kräver nätverk, som resten av historik/statistik (se CLAUDE.md).
//
// Sidindelningen är offset-baserad. Det driver om rader försvinner
// mellan två sidhämtningar: allt under flyttas upp och raden som hamnar
// på sista platsen hoppas över helt. Det är ofarligt så länge inget kan
// radera ett AVSLUTAT pass - "Släng"/"Avbryt pass" träffar bara det
// pågående, som filtret nedan redan utesluter. Skulle det någon gång gå
// att radera ur historiken måste det här bli keyset-paginering
// (started_at + id som brytpunkt).
export async function fetchWorkoutHistory(
  userId: string,
  offset: number,
  limit: number = WORKOUT_HISTORY_PAGE_SIZE,
): Promise<WorkoutHistoryEntry[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, started_at, ended_at, workout_exercises(id, order_index, exercise_id, exercises(name), sets(set_nr, reps, weight_kg))",
    )
    .eq("user_id", userId)
    // Repots konvention för "avslutade pass" - utesluter också det pass
    // som just nu pågår.
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return (data ?? []).map((workout) => {
    const workoutExercises = [...(workout.workout_exercises ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    );

    const exercises: HistoryExercise[] = workoutExercises.map((we) => ({
      workoutExerciseId: we.id,
      name: we.exercises?.name ?? "Okänd övning",
      sets: [...(we.sets ?? [])]
        .sort((a, b) => a.set_nr - b.set_nr)
        .map((s) => ({ reps: s.reps, weightKg: s.weight_kg })),
    }));

    // summarizeWorkout läser bara reps, weight_kg och exercise_id ur
    // varje SetRecord - resten krävs av typen men ignoreras, så de fylls
    // i från passet.
    const setRecords: SetRecord[] = workoutExercises.flatMap((we) =>
      (we.sets ?? []).map((s) => ({
        reps: s.reps,
        weight_kg: s.weight_kg,
        exercise_id: we.exercise_id,
        workout_id: workout.id,
        workout_started_at: workout.started_at,
      })),
    );

    return {
      id: workout.id,
      startedAt: workout.started_at,
      endedAt: workout.ended_at,
      summary: summarizeWorkout(workout, setRecords),
      exercises,
    };
  });
}
