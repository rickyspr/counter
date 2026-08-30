import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { MediaType } from "../media";
import { summarizeWorkout, type SetRecord, type WorkoutSummary } from "../stats";

type Client = SupabaseClient<Database>;

// Läsvägen för avslutade pass - egen historik (mobilens ProfileScreen,
// webbens "Mina pass") och, via mapWorkoutHistoryRow, vänners pass i
// flödet. Delar inget med mutationsvägen: den går genom mobilens
// synk-kö och stannar i appen.
//
// Klienten skickas in som första argument - varje app äger sin egen
// supabase-instans.

// En mediarad som den ser ut när den kommer från servern. Samma form för
// historiken och för redigeringen - båda behöver sökvägen (för att kunna
// signera en URL, och för att kunna städa filen vid radering).
export interface WorkoutMediaRow {
  id: string;
  mediaType: MediaType;
  storagePath: string;
  durationMs: number | null;
}

// media_type är `text` i schemat, alltså `string` i de genererade
// typerna. Check-villkoret i databasen tillåter bara två värden, men
// TypeScript vet inte det - och en tredje sträng ska rendera som en bild
// snarare än krascha.
export function toMediaRow(row: {
  id: string;
  media_type: string;
  storage_path: string;
  duration_ms: number | null;
}): WorkoutMediaRow {
  return {
    id: row.id,
    mediaType: row.media_type === "video" ? "video" : "image",
    storagePath: row.storage_path,
    durationMs: row.duration_ms,
  };
}

// added_at sätts av klienten när filen väljs, så sorteringen är den
// ordning användaren la till dem - inte den ordning de synkades. id:t
// bryter lika värden så att ordningen är stabil mellan två hämtningar.
export function sortMedia<T extends { added_at: string; id: string }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      Date.parse(a.added_at) - Date.parse(b.added_at) ||
      a.id.localeCompare(b.id),
  );
}

interface LatestWorkoutSummaryInput {
  workout: { id: string; started_at: string; ended_at: string | null };
  sets: SetRecord[];
  kudosCount: number;
}

// Hämtar det senast avslutade passet för en användare, samt alla dess set
// i det format som statistikfunktionerna förväntar sig. Kräver nätverk -
// offline-stödet täcker loggning, inte att bläddra i historik/statistik.
export async function fetchLatestWorkoutSummaryInput(
  client: Client,
  userId: string,
): Promise<LatestWorkoutSummaryInput | null> {
  const { data: workout, error: workoutError } = await client
    .from("workouts")
    .select("id, started_at, ended_at, workout_kudos(user_id)")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) return null;

  const kudosCount = (workout.workout_kudos ?? []).length;

  const { data: workoutExercises, error: weError } = await client
    .from("workout_exercises")
    .select("id, exercise_id")
    .eq("workout_id", workout.id);
  if (weError) throw weError;

  if (!workoutExercises || workoutExercises.length === 0) {
    return { workout, sets: [], kudosCount };
  }

  const exerciseByWorkoutExerciseId = new Map(
    workoutExercises.map((we) => [we.id, we.exercise_id]),
  );

  const { data: setRows, error: setsError } = await client
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

  return { workout, sets, kudosCount };
}

export const WORKOUT_HISTORY_PAGE_SIZE = 20;

export interface HistoryExercise {
  workoutExerciseId: string;
  name: string;
  // undefined = kolumnen fanns inte i selecten. null = hämtad men tom.
  // Fritext i databasen (muscle_group är `text` utan enum).
  muscleGroup?: string | null;
  // I positionsordning. set_nr kan ha luckor efter en borttagning, så
  // raderna märks med sin POSITION i vyn - aldrig med set_nr.
  sets: { reps: number; weightKg: number }[];
}

export interface WorkoutHistoryEntry {
  id: string;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: WorkoutSummary;
  exercises: HistoryExercise[];
  // Bara metadata - inga signerade URL:er. Anroparen signerar en hel
  // sida i EN gång efter hämtningen (se signMediaUrls i media-urls.ts).
  media: WorkoutMediaRow[];
  // Antal peppa mottagna, oavsett vem som gett dem.
  kudosCount: number;
}

// Brytpunkten för nästa sida: sista raden på den föregående. Se
// fetchWorkoutHistory nedan för varför det inte är en offset.
export interface WorkoutHistoryCursor {
  startedAt: string;
  id: string;
}

export function cursorFor(
  entries: WorkoutHistoryEntry[],
): WorkoutHistoryCursor | null {
  const last = entries[entries.length - 1];
  return last ? { startedAt: last.startedAt, id: last.id } : null;
}

// "started_at < X, eller samma started_at och id < Y". Tidsstämpeln
// måste citeras: PostgREST delar or-uttrycket på komma och punkt, och
// en ISO-sträng innehåller både ":" och "+". Utbruten så att
// fetchWorkoutHistory, fetchFeed och exporthämtaren delar exakt samma
// keyset-uttryck - en tredje handskriven kopia vore duplicerad logik.
export function keysetFilter(cursor: WorkoutHistoryCursor): string {
  return `started_at.lt."${cursor.startedAt}",and(started_at.eq."${cursor.startedAt}",id.lt.${cursor.id})`;
}

// En sida av passhistoriken, med alla set inbäddade i SAMMA anrop. Att
// setsen följer med direkt är hela poängen: detaljvyn behöver ingen egen
// fråga, utan renderar ur det som listan redan laddat.
//
// Sidindelningen är KEYSET-baserad, inte offset-baserad. En offset
// driver så fort en rad försvinner mellan två sidhämtningar: allt under
// flyttas upp ett steg och raden som då hamnar på offsetens plats hoppas
// över helt. Både att radera ett avslutat pass och att ändra dess
// starttid (alltså flytta det i sorteringen) går att göra mitt under en
// pågående bläddring.
//
// Brytpunkten är (started_at, id). Bara started_at räcker inte: två pass
// kan ha exakt samma starttid. `id` är godtyckligt som ordning men
// behöver bara vara STABILT och totalt, vilket en primärnyckel är.
export async function fetchWorkoutHistory(
  client: Client,
  userId: string,
  cursor: WorkoutHistoryCursor | null,
  limit: number = WORKOUT_HISTORY_PAGE_SIZE,
): Promise<WorkoutHistoryEntry[]> {
  let query = client
    .from("workouts")
    .select(
      "id, name, started_at, ended_at, workout_media(id, media_type, storage_path, added_at, duration_ms), workout_exercises(id, order_index, exercise_id, exercises(name), sets(set_nr, reps, weight_kg)), workout_kudos(user_id)",
    )
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(keysetFilter(cursor));
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(mapWorkoutHistoryRow);
}

// Formen på en workouts-rad hämtad med den inbäddade selecten ovan -
// samma fält fetchFeed hämtar för vänners pass, vilket är vad som gör
// mappningen återanvändbar dit.
export interface RawWorkoutRow {
  id: string;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  workout_media?:
    | {
        id: string;
        media_type: string;
        storage_path: string;
        added_at: string;
        duration_ms: number | null;
      }[]
    | null;
  workout_exercises?:
    | {
        id: string;
        order_index: number;
        exercise_id: string;
        exercises: { name: string; muscle_group?: string | null } | null;
        sets: { set_nr: number; reps: number; weight_kg: number }[] | null;
      }[]
    | null;
  workout_kudos?: { user_id: string }[] | null;
}

// Utbruten så att feed.ts kan återanvända samma mappning för vänners pass.
export function mapWorkoutHistoryRow(
  workout: RawWorkoutRow,
): WorkoutHistoryEntry {
  const workoutExercises = [...(workout.workout_exercises ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  );

  const exercises: HistoryExercise[] = workoutExercises.map((we) => ({
    workoutExerciseId: we.id,
    name: we.exercises?.name ?? "Okänd övning",
    // Ingen ?? null - undefined (kolumnen saknas i selecten) ska bevaras.
    muscleGroup: we.exercises?.muscle_group,
    sets: [...(we.sets ?? [])]
      .sort((a, b) => a.set_nr - b.set_nr)
      .map((s) => ({ reps: s.reps, weightKg: s.weight_kg })),
  }));

  // summarizeWorkout läser bara reps, weight_kg och exercise_id ur varje
  // SetRecord - resten krävs av typen men ignoreras.
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
    name: workout.name,
    startedAt: workout.started_at,
    endedAt: workout.ended_at,
    summary: summarizeWorkout(workout, setRecords),
    exercises,
    media: sortMedia(workout.workout_media ?? []).map(toMediaRow),
    kudosCount: (workout.workout_kudos ?? []).length,
  };
}
