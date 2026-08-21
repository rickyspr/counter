import { getOnlineStatus, onReconnect } from "./network";
import { readJSON, writeJSON } from "./storage";
import { supabase } from "./supabase";

type QueuedAction =
  | {
      type: "start_workout";
      id: string;
      user_id: string;
      started_at: string;
    }
  | {
      type: "add_exercise";
      id: string;
      workout_id: string;
      exercise_id: string;
      order_index: number;
    }
  | {
      type: "add_set";
      // Valfritt: köposter som sparades av en äldre appversion saknar id.
      id?: string;
      workout_exercise_id: string;
      set_nr: number;
      reps: number;
      weight_kg: number;
    }
  | {
      type: "delete_set";
      id: string;
    }
  | {
      type: "delete_exercise";
      id: string;
    }
  | {
      type: "delete_workout";
      workout_id: string;
    }
  | {
      type: "end_workout";
      workout_id: string;
      ended_at: string;
    }
  | {
      // Redigering av ett redan avslutat pass: namn och/eller tider.
      // Utelämnat fält = rör inte kolumnen; `name: null` = töm den.
      // Skillnaden överlever JSON-rundturen till disk eftersom
      // undefined-nycklar försvinner i serialiseringen, medan null
      // ligger kvar.
      type: "update_workout";
      workout_id: string;
      name?: string | null;
      started_at?: string;
      ended_at?: string;
    };

const STORAGE_KEY = "repcount:offline-queue";

let queue: QueuedAction[] = [];
let loadPromise: Promise<void> | null = null;
let flushing = false;
const pendingListeners = new Set<(length: number) => void>();
const errorListeners = new Set<(message: string) => void>();

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = readJSON<QueuedAction[]>(STORAGE_KEY, []).then((stored) => {
      queue = stored;
    });
  }
  return loadPromise;
}

async function persist(): Promise<void> {
  await writeJSON(STORAGE_KEY, queue);
  for (const listener of pendingListeners) listener(queue.length);
}

// Riktiga serverfel (t.ex. RLS-avslag eller en trasig referens) har en
// IFYLLD `code` från Postgrest/Postgres - "23505", "42501", "PGRST116".
// De kommer aldrig gå igenom och ska inte försökas om för evigt.
//
// Allt annat ska försökas om. Viktigt: postgrest-js sätter `code: ""`
// (tom sträng, inte avsaknad av fältet) när själva nätverksanropet
// misslyckas, alltså exakt det som händer offline. Ett svar som inte
// går att tolka som JSON - t.ex. en 502-sida från en proxy - ger ett
// fel helt utan `code`. Båda är övergående.
function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const code = (err as { code?: unknown }).code;
  return typeof code !== "string" || code === "";
}

// Skickar en åtgärd i taget till Supabase, i kö-ordning. Ordningen
// måste hållas eftersom t.ex. "add_exercise" refererar till ett
// workout_id som "start_workout" kan ha skapat lokalt. Inserts som
// kan skickas igen (samma klientgenererade id, eller samma
// unik-nyckel för set) är upsert - annars skulle ett lyckat men
// "tappat" svar göra att ett omförsök krockar med sig självt. Delete
// på en rad som inte finns är en no-op, så även de tål omförsök.
//
// Ordningen gör också redigering/borttagning säker: en "delete_set"
// som köas medan dess "add_set" fortfarande ligger kvar spelas upp
// EFTER insert:en, och nettoresultatet blir rätt. En redigering är
// bara ett nytt "add_set" med samma id och nya värden.
async function applyAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case "start_workout": {
      const { error } = await supabase
        .from("workouts")
        .upsert({ id: action.id, user_id: action.user_id, started_at: action.started_at });
      if (error) throw error;
      return;
    }
    case "add_exercise": {
      const { error } = await supabase.from("workout_exercises").upsert({
        id: action.id,
        workout_id: action.workout_id,
        exercise_id: action.exercise_id,
        order_index: action.order_index,
      });
      if (error) throw error;
      return;
    }
    case "add_set": {
      const { error } = await supabase.from("sets").upsert(
        {
          // Saknas id (kö från en äldre appversion) sätter servern det
          // själv via gen_random_uuid().
          ...(action.id ? { id: action.id } : {}),
          workout_exercise_id: action.workout_exercise_id,
          set_nr: action.set_nr,
          reps: action.reps,
          weight_kg: action.weight_kg,
        },
        { onConflict: "workout_exercise_id,set_nr" },
      );
      if (error) throw error;
      return;
    }
    case "delete_set": {
      const { error } = await supabase.from("sets").delete().eq("id", action.id);
      if (error) throw error;
      return;
    }
    case "delete_exercise": {
      // Setsen under övningen städas av `on delete cascade`.
      const { error } = await supabase
        .from("workout_exercises")
        .delete()
        .eq("id", action.id);
      if (error) throw error;
      return;
    }
    case "delete_workout": {
      // Övningarna och deras sets städas av `on delete cascade`. Ligger
      // passets egna "start_workout"/"add_set" kvar längre fram i kön
      // spelas de upp FÖRE den här (FIFO), så raderingen städar bort
      // dem efteråt och nettoresultatet blir rätt.
      const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", action.workout_id);
      if (error) throw error;
      return;
    }
    case "end_workout": {
      const { error } = await supabase
        .from("workouts")
        .update({ ended_at: action.ended_at })
        .eq("id", action.workout_id);
      if (error) throw error;
      return;
    }
    case "update_workout": {
      // Bara de fält som faktiskt ändrats skickas, så ett namnbyte inte
      // råkar skriva tillbaka tider och tvärtom. `!== undefined` istället
      // för `in`: då betyder null "töm kolumnen" utan att ett anrop som
      // råkar skicka `name: undefined` tolkas som en tömning.
      const patch: {
        name?: string | null;
        started_at?: string;
        ended_at?: string;
      } = {};
      if (action.name !== undefined) patch.name = action.name;
      if (action.started_at !== undefined) patch.started_at = action.started_at;
      if (action.ended_at !== undefined) patch.ended_at = action.ended_at;
      // En tom patch är ingen no-op mot Postgrest utan ett 400-fel, och
      // det felet har en `code` - alltså permanent, alltså en dialog för
      // något som inte var en ändring. Fånga det här istället.
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from("workouts")
        .update(patch)
        .eq("id", action.workout_id);
      if (error) throw error;
      return;
    }
  }
}

export async function enqueue(action: QueuedAction): Promise<void> {
  await ensureLoaded();
  queue.push(action);
  await persist();
  void flush();
}

export async function flush(): Promise<void> {
  if (flushing) return;
  // Utan nät finns inget att vinna på att försöka - varje åtgärd skulle
  // bara vänta ut en timeout. onReconnect() nedan kör flush() igen så
  // fort uppkopplingen är tillbaka.
  if (!getOnlineStatus()) return;
  flushing = true;
  try {
    await ensureLoaded();
    while (queue.length > 0) {
      try {
        await applyAction(queue[0]!);
      } catch (err) {
        if (isRetryable(err)) {
          // Fortfarande offline (eller ett tillfälligt fel) - försök
          // igen nästa gång flush() anropas.
          return;
        }
        // Ett riktigt serverfel - den här åtgärden kommer aldrig att
        // gå igenom. Släpp den så att resten av kön inte fastnar
        // bakom den, och meddela så UI kan visa det för användaren.
        const message = err instanceof Error ? err.message : "Kunde inte synka en ändring.";
        for (const listener of errorListeners) listener(message);
      }
      queue.shift();
      await persist();
    }
  } finally {
    flushing = false;
  }
}

// Tömmer kön och svarar om den faktiskt BLEV tom.
//
// Redigering av ett avslutat pass delar ut nya order_index/set_nr som
// max+1 över det servern svarar med (se fetchWorkoutForEdit i
// queries.ts). Det stämmer bara om allt som finns har nått servern -
// ligger en "add_exercise" kvar i kön är serverns max för lågt, samma
// nummer delas ut igen, och unique (workout_id, order_index) fäller
// upserten med 23505. Det är ett permanent fel, så kön slänger åtgärden
// och setsen under övningen följer med på sin trasiga referens.
//
// Returnerar false också när en annan flush redan pågår (flush() nedan
// returnerar direkt då) - fel åt det säkra hållet: hellre "försök igen"
// än ett nummer som kanske redan är taget.
export async function drainQueue(): Promise<boolean> {
  await flush();
  return (await getPendingCount()) === 0;
}

export async function getPendingCount(): Promise<number> {
  await ensureLoaded();
  return queue.length;
}

export function subscribeToPendingCount(
  listener: (length: number) => void,
): () => void {
  pendingListeners.add(listener);
  getPendingCount().then(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

export function subscribeToSyncErrors(listener: (message: string) => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

// Försök synka direkt vid appstart (t.ex. om kön har åtgärder kvar
// sedan en tidigare session) och varje gång uppkopplingen återkommer.
void flush();
onReconnect(() => void flush());
