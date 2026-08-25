import {
  mediaStoragePath,
  summarizeWorkout,
  type MediaType,
  type SetRecord,
  type WorkoutSummary,
} from "@repcount/shared";
import * as Crypto from "expo-crypto";
import type { PersistedMedia } from "./active-workout";
import { cancelUpload, enqueueRemove, enqueueUpload } from "./media-queue";
import type { ImportedMedia } from "./media-store";
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

// En övning skapad offline måste överleva att appen dödas innan
// "create_exercise" hunnit synka - annars försvinner den ur väljaren vid
// nästa öppning fast åtgärden fortfarande ligger kvar i kön.
async function cacheCreatedExercise(exercise: ExerciseOption): Promise<void> {
  const cached = await readJSON<ExerciseOption[] | null>(EXERCISE_CACHE_KEY, null);
  const withoutDuplicate = (cached ?? []).filter((e) => e.id !== exercise.id);
  await writeJSON(EXERCISE_CACHE_KEY, [...withoutDuplicate, exercise]);
}

export async function createCustomExercise(
  userId: string,
  name: string,
  muscleGroup: string | null,
): Promise<ExerciseOption> {
  const id = Crypto.randomUUID();
  await enqueue({ type: "create_exercise", id, user_id: userId, name, muscle_group: muscleGroup });
  const exercise: ExerciseOption = { id, name, muscle_group: muscleGroup };
  await cacheCreatedExercise(exercise);
  return exercise;
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

// `name` är passets namn som det ser ut vid avslutet - antingen det
// användaren skrivit, eller det förvalda som härletts ur starttiden (se
// defaultWorkoutName i @repcount/shared). Ett pass som avslutas här har
// alltså ALLTID ett namn; null i kolumnen betyder ett pass loggat innan
// den här funktionen fanns, och de visas med sitt datum som förut.
export async function endWorkout(
  workoutId: string,
  name: string,
): Promise<{ ended_at: string }> {
  const ended_at = new Date().toISOString();
  await enqueue({ type: "end_workout", workout_id: workoutId, ended_at, name });
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
// `on delete cascade`. Används när man avbryter ett pågående pass,
// slänger ett återupptaget, eller raderar ett avslutat ur historiken.
//
// Att det sista blev möjligt är anledningen till att fetchWorkoutHistory
// nedan är keyset-paginerad och inte offset-paginerad.
export async function deleteWorkout(workoutId: string): Promise<void> {
  await enqueue({ type: "delete_workout", workout_id: workoutId });
}

// Namn och tider på ett avslutat pass.
//
// Tiderna tas emot som ETT värde, aldrig var för sig. Tabellen har
// `check (ended_at is null or ended_at >= started_at)`, och en patch med
// bara en ny starttid vägs mot den sluttid som redan ligger i databasen.
// Flyttar man starten förbi den gamla sluttiden fäller villkoret
// uppdateringen med 23514 - permanent fel, alltså slänger synk-kön
// åtgärden och ändringen försvinner utan att ha hänt. Skickas båda
// samtidigt jämförs de mot varandra och kontrollen nedan har redan
// avgjort saken.
export interface WorkoutTimes {
  startedAt: string;
  endedAt: string;
}

export async function updateWorkoutDetails(
  workoutId: string,
  patch: { name?: string | null; times?: WorkoutTimes },
): Promise<void> {
  // Jämförs som tidpunkter, inte som strängar: en sträng-jämförelse
  // stämmer bara så länge båda har exakt samma ISO-format och zon.
  if (
    patch.times &&
    Date.parse(patch.times.endedAt) < Date.parse(patch.times.startedAt)
  ) {
    // Sista spärren före kön. UI:t hindrar det redan, men ett fel här är
    // synligt och går att åtgärda - ett fel i kön är det inte.
    throw new Error("Sluttiden kan inte vara före starttiden.");
  }

  await enqueue({
    type: "update_workout",
    workout_id: workoutId,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.times
      ? { started_at: patch.times.startedAt, ended_at: patch.times.endedAt }
      : {}),
  });
}

// Media går genom TVÅ köer, till skillnad från allt annat här.
//
// Byte:sen läggs i uppladdningskön (media-queue.ts), som laddar upp dem
// till Storage och FÖRST därefter köar metadataraden i den vanliga
// synk-kön. Filerna får inte in i synk-kön: den skriver om sig själv i
// sin helhet vid varje enqueue och blockerar på sitt huvud, så en video
// hade låst varje set-skrivning bakom sig.
//
// Regeln överst i den här filen håller ändå: ingenting nedan skriver
// direkt mot Supabase.
export async function addWorkoutMedia(
  userId: string,
  workoutId: string,
  imported: ImportedMedia,
): Promise<PersistedMedia> {
  // Sökvägen räknas ut HÄR, en gång, och sparas i passets blob. Då går
  // filen att städa bort även innan uppladdningen körts - och ett
  // omförsök landar på exakt samma plats.
  const storagePath = mediaStoragePath(
    userId,
    workoutId,
    imported.mediaId,
    imported.extension,
  );

  await enqueueUpload({
    userId,
    mediaId: imported.mediaId,
    workoutId,
    storagePath,
    localUri: imported.localUri,
    mimeType: imported.mimeType,
    mediaType: imported.mediaType,
    // Klientens klocka, inte serverns: passet kan synkas i klump långt
    // efteråt, och då hade now() gett synk-ordningen istället för den
    // ordning användaren faktiskt la till filerna.
    addedAt: new Date().toISOString(),
    width: imported.width,
    height: imported.height,
    durationMs: imported.durationMs,
  });

  return {
    id: imported.mediaId,
    mediaType: imported.mediaType,
    localUri: imported.localUri,
    storagePath,
    durationMs: imported.durationMs,
  };
}

// Tar bort media var det än råkar befinna sig: i uppladdningskön, i
// Storage, i workout_media - eller i flera samtidigt.
//
// Alla tre stegen är no-ops när målet inte finns, och det är avsiktligt.
// De körs ALLA, varje gång, eftersom klienten inte säkert vet var i
// flödet objektet är: en uppladdning kan vara klar utan att raden hunnit
// köas. cancelUpload spärrar det vanliga fallet, och "delete_media"
// täcker kapplöpningen - synk-kön är FIFO, så den hamnar bakom det
// "add_media" som eventuellt hann köas och nettoresultatet blir rätt.
export async function removeWorkoutMedia(
  userId: string,
  mediaId: string,
  storagePath: string,
): Promise<void> {
  await cancelUpload(mediaId);
  await enqueue({ type: "delete_media", id: mediaId });
  await enqueueRemove(userId, [storagePath]);
}

// Städning när ett HELT pass slängs. Raderna försvinner med
// `on delete cascade`, men Storage vet ingenting om public-schemat -
// filerna hade blivit kvar och ätit kvot för alltid.
export async function removeAllWorkoutMedia(
  userId: string,
  media: { id: string; storagePath: string }[],
): Promise<void> {
  if (media.length === 0) return;
  for (const item of media) await cancelUpload(item.id);
  // Ett enda jobb för hela passet: Storage tar en lista med sökvägar,
  // och en video kvar i kön ska inte behöva vänta på tio raderingar.
  await enqueueRemove(
    userId,
    media.map((item) => item.storagePath),
  );
}

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
function toMediaRow(row: {
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
function sortMedia<T extends { added_at: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Date.parse(a.added_at) - Date.parse(b.added_at) ||
      a.id.localeCompare(b.id),
  );
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
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: WorkoutSummary;
  exercises: HistoryExercise[];
  // Bara metadata - inga signerade URL:er. ProfileScreen signerar en
  // hel sida i EN gång efter hämtningen (se signMediaUrls i
  // media-urls.ts), inte per pass: historiklistan visar numera
  // bilderna direkt, så antagandet som stod här tidigare - att ingen
  // tittar på dem förrän passet öppnas - gäller inte längre.
  media: WorkoutMediaRow[];
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

// En sida av passhistoriken, med alla set inbäddade i SAMMA anrop -
// samma mönster som fetchPreviousSetsForExercise ovan. Att setsen följer
// med direkt är hela poängen: detaljvyn behöver ingen egen fråga, utan
// renderar ur det som listan redan laddat.
//
// Kräver nätverk, som resten av historik/statistik (se CLAUDE.md).
//
// Sidindelningen är KEYSET-baserad, inte offset-baserad. En offset
// driver så fort en rad försvinner mellan två sidhämtningar: allt under
// flyttas upp ett steg och raden som då hamnar på offsetens plats
// hoppas över helt. Förut var det ofarligt - inget kunde radera ett
// avslutat pass - men numera går det både att radera ett pass ur
// historiken och att ändra dess starttid, alltså flytta det i
// sorteringen, mitt under en pågående bläddring.
//
// Brytpunkten är (started_at, id). Bara started_at räcker inte: två
// pass kan ha exakt samma starttid, och då hade det ena tappats. `id`
// är godtyckligt som ordning men behöver bara vara STABILT och totalt,
// vilket en primärnyckel är. Sekundärsorteringen på id nedan hör ihop
// med det - utan den är ordningen mellan två lika starttider inte
// definierad, och då betyder brytpunkten ingenting.
export async function fetchWorkoutHistory(
  userId: string,
  cursor: WorkoutHistoryCursor | null,
  limit: number = WORKOUT_HISTORY_PAGE_SIZE,
): Promise<WorkoutHistoryEntry[]> {
  let query = supabase
    .from("workouts")
    .select(
      "id, name, started_at, ended_at, workout_media(id, media_type, storage_path, added_at, duration_ms), workout_exercises(id, order_index, exercise_id, exercises(name), sets(set_nr, reps, weight_kg))",
    )
    .eq("user_id", userId)
    // Repots konvention för "avslutade pass" - utesluter också det pass
    // som just nu pågår.
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    // "started_at < X, eller samma started_at och id < Y" - alltså allt
    // som ligger strikt efter brytpunkten i sorteringen ovan.
    //
    // Tidsstämpeln måste citeras. PostgREST delar or-uttrycket på komma
    // och punkt, och en ISO-sträng innehåller både ":" och "+" som
    // annars tolkas som delar av syntaxen istället för som värde.
    query = query.or(
      `started_at.lt."${cursor.startedAt}",and(started_at.eq."${cursor.startedAt}",id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
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
      name: workout.name,
      startedAt: workout.started_at,
      endedAt: workout.ended_at,
      summary: summarizeWorkout(workout, setRecords),
      exercises,
      media: sortMedia(workout.workout_media ?? []).map(toMediaRow),
    };
  });
}

export interface EditableSet {
  id: string;
  setNr: number;
  reps: number;
  weightKg: number;
}

export interface EditableExercise {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: EditableSet[];
}

export interface EditableWorkout {
  id: string;
  name: string | null;
  startedAt: string;
  endedAt: string;
  exercises: EditableExercise[];
  media: WorkoutMediaRow[];
  // Nästa lediga nummer, uträknade som max+1 över det servern svarade
  // med. Samma form som räknarna i ActiveWorkoutScreen.
  nextOrderIndex: number;
  nextSetNr: Record<string, number>;
}

// Hämtar ETT avslutat pass för redigering, inklusive set-id:n (som
// historikfrågan inte behöver) och de räknare som nya övningar och set
// ska numreras ur.
//
// Läser om passet från servern istället för att återanvända raden
// listan redan har. Två skäl: listan kan vara minuter gammal och
// ändrad från en annan enhet, och den saknar ändå set-id:n.
//
// max+1 är säkert HÄR men vore det inte i ActiveWorkoutScreen, och
// skillnaden är värd att hålla isär. Ett pågående pass har halvifyllda
// rader som med flit aldrig skrivits, och kan ha åtgärder kvar i
// synk-kön - serverns max säger då inte vad som är upptaget. Ett
// avslutat pass öppnas bara med nät OCH tömd kö (se drainQueue i
// offline-queue.ts), så allt som finns är på servern när det här körs.
// Under själva redigeringen räknas numren upp lokalt och monotont, och
// dör appen mitt i ligger de köade raderna kvar på disk med sina
// nummer - nästa öppning tömmer kön först och läser då ett max som
// redan är förbi dem.
export async function fetchWorkoutForEdit(
  userId: string,
  workoutId: string,
): Promise<EditableWorkout> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, started_at, ended_at, workout_media(id, media_type, storage_path, added_at, duration_ms), workout_exercises(id, order_index, exercise_id, exercises(name), sets(id, set_nr, reps, weight_kg))",
    )
    .eq("user_id", userId)
    // Bara avslutade pass går att redigera här. Ett pågående pass ägs av
    // den lokala blobben (active-workout.ts), och dess räknare finns
    // inte på servern - att redigera det härifrån skulle dela ut nummer
    // som pass-skärmen redan reserverat.
    .not("ended_at", "is", null)
    .eq("id", workoutId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.ended_at === null) {
    throw new Error("Passet finns inte längre.");
  }

  const workoutExercises = [...(data.workout_exercises ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  );

  const nextSetNr: Record<string, number> = {};
  const exercises: EditableExercise[] = workoutExercises.map((we) => {
    const sets = [...(we.sets ?? [])]
      .sort((a, b) => a.set_nr - b.set_nr)
      .map((s) => ({
        id: s.id,
        setNr: s.set_nr,
        reps: s.reps,
        weightKg: s.weight_kg,
      }));
    nextSetNr[we.id] =
      sets.reduce((max, s) => Math.max(max, s.setNr), 0) + 1;
    return {
      workoutExerciseId: we.id,
      exerciseId: we.exercise_id,
      exerciseName: we.exercises?.name ?? "Okänd övning",
      sets,
    };
  });

  return {
    id: data.id,
    name: data.name,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    exercises,
    media: sortMedia(data.workout_media ?? []).map(toMediaRow),
    // -1 + 1 = 0 för ett pass utan övningar; order_index börjar på 0.
    nextOrderIndex:
      workoutExercises.reduce((max, we) => Math.max(max, we.order_index), -1) + 1,
    nextSetNr,
  };
}
