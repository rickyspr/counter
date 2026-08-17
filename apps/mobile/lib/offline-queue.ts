import { onReconnect } from "./network";
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
      workout_exercise_id: string;
      set_nr: number;
      reps: number;
      weight_kg: number;
    }
  | {
      type: "end_workout";
      workout_id: string;
      ended_at: string;
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

// Riktiga serverfel (kod från Postgrest, t.ex. RLS-avslag eller en
// trasig referens) kommer tillbaka som ett objekt med `code` utan att
// nätverksanropet i sig misslyckades - de ska INTE försökas om för
// evigt. Ett nätverksfel (offline) har ingen sådan form.
function isRetryable(err: unknown): boolean {
  return !(err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string");
}

// Skickar en åtgärd i taget till Supabase, i kö-ordning. Ordningen
// måste hållas eftersom t.ex. "add_exercise" refererar till ett
// workout_id som "start_workout" kan ha skapat lokalt. Inserts som
// kan skickas igen (samma klientgenererade id, eller samma
// unik-nyckel för set) är upsert - annars skulle ett lyckat men
// "tappat" svar göra att ett omförsök krockar med sig självt.
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
    case "end_workout": {
      const { error } = await supabase
        .from("workouts")
        .update({ ended_at: action.ended_at })
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
