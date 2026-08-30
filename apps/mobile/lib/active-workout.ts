import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MediaType } from "@counter/shared";
import type { PreviousSet } from "./queries";
import { readJSON, writeJSON } from "./storage";

// Synk-kön (offline-queue.ts) räddar redan all DATA som skrivits - den
// ligger på disk och spelas upp mot Supabase när nätet finns. Det som
// går förlorat när appen dödas är UI-TILLSTÅNDET i ActiveWorkoutScreen:
// vilka övningar som lagts till, halvifyllda set-rader som medvetet
// aldrig skrivits, och framför allt de monotona räknarna.
//
// Räknarna är hela anledningen till att detta inte går att lösa genom
// att fråga servern efter passet med `ended_at is null`: set_nr och
// order_index får ALDRIG återanvändas, och max(set_nr)+1 över de rader
// som råkar finnas kvar krockar efter en borttagning. Då skulle
// upserten i kön (onConflict: workout_exercise_id,set_nr) skriva över
// ett annat set i tysthet. Se kommentarerna i ActiveWorkoutScreen.
const STORAGE_KEY = "counter:active-workout";

// Ett pass som ligger kvar ett dygn är bortglömt, inte pågående. Städas
// bort vid appstart istället för att erbjudas.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PersistedSet {
  id: string;
  setNr: number;
  repsDraft: string;
  weightDraft: string;
  saved: { reps: number; weightKg: number } | null;
}

export interface PersistedSection {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: PersistedSet[];
  previousSets: PreviousSet[];
}

// Media som lagts till under passet. Filen ligger lokalt (se
// media-store.ts) och laddas upp i bakgrunden av media-queue.ts.
//
// Blobben är källan här, inte servern: byte:sen kan ha legat i
// uppladdningskön i timmar, och ett pass som loggas offline har
// ingenting alls på servern att läsa. `storagePath` räknas ut redan när
// filen väljs, så den finns att städa med även innan uppladdningen
// hunnit köras.
export interface PersistedMedia {
  id: string;
  mediaType: MediaType;
  localUri: string;
  storagePath: string;
  durationMs: number | null;
}

export interface ActiveWorkout {
  version: 1;
  userId: string;
  workoutId: string;
  startedAt: string;
  // Vad användaren skrivit i namnfältet, tomt om hen inte rört det.
  // Valfritt, och versionen är MEDVETET kvar på 1: en bump hade fått
  // parseStored att kasta alla pass som pågick när appen uppdaterades.
  // Ett pass från en äldre version saknar bara fältet, och det tomma
  // namnet betyder samma sak som att inte ha döpt passet.
  name?: string;
  // Nästa lediga order_index för passet, och nästa lediga set_nr per
  // övning. Samma form som refarna i ActiveWorkoutScreen.
  nextOrderIndex: number;
  nextSetNr: Record<string, number>;
  sections: PersistedSection[];
  // Valfritt, och versionen är MEDVETET kvar på 1 - av exakt samma skäl
  // som `name` ovan. Ett pass som pågick när appen uppdaterades saknar
  // bara fältet, och inga media är precis vad det betyder.
  media?: PersistedMedia[];
}

// readJSON gör en ovaliderad `as T`-cast och JSON.parse kastar på
// trasig data, så allt som kommer från disk måste kontrolleras här.
// Fel användare räknas också som "inget pass" - blobben är stämplad med
// userId så att ett pass aldrig kan dyka upp hos nästa som loggar in.
//
// Kontrollen går hela vägen ned i sets: en halvskriven blob där en
// sektion saknar `sets` skulle annars ta sig igenom och krascha
// renderingen av pass-skärmen vid varje försök att öppna passet. Bättre
// att tappa ett trasigt pass än att låsa appen på det.
function isSet(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const set = raw as Record<string, unknown>;
  if (typeof set.id !== "string") return false;
  if (typeof set.setNr !== "number") return false;
  if (typeof set.repsDraft !== "string") return false;
  if (typeof set.weightDraft !== "string") return false;
  if (set.saved !== null && typeof set.saved !== "object") return false;
  return true;
}

function isSection(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const section = raw as Record<string, unknown>;
  if (typeof section.workoutExerciseId !== "string") return false;
  if (typeof section.exerciseId !== "string") return false;
  if (typeof section.exerciseName !== "string") return false;
  if (!Array.isArray(section.previousSets)) return false;
  if (!Array.isArray(section.sets)) return false;
  return section.sets.every(isSet);
}

function isMedia(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const media = raw as Record<string, unknown>;
  if (typeof media.id !== "string") return false;
  if (media.mediaType !== "image" && media.mediaType !== "video") return false;
  if (typeof media.localUri !== "string") return false;
  // Utan sökvägen går filen varken att ladda upp eller städa bort.
  if (typeof media.storagePath !== "string") return false;
  return media.durationMs === null || typeof media.durationMs === "number";
}

function parseStored(raw: unknown, userId: string): ActiveWorkout | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ActiveWorkout>;
  if (value.version !== 1) return null;
  if (value.userId !== userId) return null;
  if (typeof value.workoutId !== "string") return null;
  if (typeof value.startedAt !== "string") return null;
  // Får saknas (blob från en äldre version), men inte vara skräp.
  if (value.name !== undefined && typeof value.name !== "string") return null;
  if (typeof value.nextOrderIndex !== "number") return null;
  if (!value.nextSetNr || typeof value.nextSetNr !== "object") return null;
  if (!Array.isArray(value.sections)) return null;
  if (!value.sections.every(isSection)) return null;
  // Får saknas (blob från en äldre version), men inte vara skräp.
  if (value.media !== undefined) {
    if (!Array.isArray(value.media)) return null;
    if (!value.media.every(isMedia)) return null;
  }
  return value as ActiveWorkout;
}

export async function loadActiveWorkout(
  userId: string,
): Promise<ActiveWorkout | null> {
  try {
    const raw = await readJSON<unknown>(STORAGE_KEY, null);
    return parseStored(raw, userId);
  } catch {
    // Trasig JSON på disk ska inte hindra appen från att starta.
    return null;
  }
}

export function isExpired(session: ActiveWorkout): boolean {
  const startedAt = Date.parse(session.startedAt);
  if (Number.isNaN(startedAt)) return true;
  return Date.now() - startedAt > MAX_AGE_MS;
}

// Skärmen sparar vid varje ändring, alltså vid varje tangenttryck. Två
// överlappande skrivningar mot samma nyckel har ingen garanterad
// ordning, så ALLA operationer på nyckeln - både spara och rensa - läggs
// i en och samma kedja och körs en i taget.
//
// Att rensningen går genom samma kedja är det viktiga: annars kan en
// skrivning som redan är i luften när passet avslutas landa EFTER
// removeItem och återuppliva ett avslutat pass, som sedan erbjuds som
// "pågående" nästa gång appen öppnas.
let pending: ActiveWorkout | null = null;
let chain: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  // Samma task som avvisad-hanterare: en misslyckad skrivning får inte
  // döda kedjan för resten av sessionen.
  chain = chain.then(task, task);
  return chain;
}

export function saveActiveWorkout(session: ActiveWorkout): Promise<void> {
  pending = session;
  return enqueueWrite(async () => {
    const next = pending;
    pending = null;
    // Redan skrivet av en tidigare task (flera tangenttryck i rad slås
    // ihop till en skrivning), eller undanröjt av en clear som köats
    // efteråt. Sista värdet vinner.
    if (!next) return;
    await writeJSON(STORAGE_KEY, next);
  });
}

export function clearActiveWorkout(): Promise<void> {
  pending = null;
  return enqueueWrite(() => AsyncStorage.removeItem(STORAGE_KEY));
}
