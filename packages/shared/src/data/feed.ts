import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { WorkoutSummary } from "../stats";
import type { Friend } from "./follows";
import {
  keysetFilter,
  mapWorkoutHistoryRow,
  WORKOUT_HISTORY_PAGE_SIZE,
  type HistoryExercise,
  type WorkoutHistoryCursor,
  type WorkoutMediaRow,
} from "./workout-history";

type Client = SupabaseClient<Database>;

// Flödet är en flera-användare-fråga, kräver alltid nätverk (ingen
// offline-support för sociala actions) och gör aldrig skrivningar via
// mobilens synk-kö - kudos är, precis som en vänförfrågan, en
// engångshandling utan ordningsberoende mot köade actions.

export interface FeedWorkoutEntry {
  id: string;
  userId: string;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  summary: WorkoutSummary;
  exercises: HistoryExercise[];
  media: WorkoutMediaRow[];
  authorDisplayName: string | null;
  authorAvatarPath: string | null;
  kudosCount: number;
  kudosGivenByMe: boolean;
}

export function feedCursorFor(
  entries: FeedWorkoutEntry[],
): WorkoutHistoryCursor | null {
  const last = entries[entries.length - 1];
  return last ? { startedAt: last.startedAt, id: last.id } : null;
}

// Samma inbäddade-select + keyset-mönster som fetchWorkoutHistory, men
// user_id in (<vän-id:n>) istället för = userId, och med
// workout_kudos(user_id) inbäddat så att antal + "gillat av mig" följer
// med i samma anrop.
//
// Författarnamn/avatar slås upp ur `friends` (redan hämtad via
// listFriends() för vänlistan) istället för en server-side join - det
// som gör att flödet inte behöver en egen security-definer-funktion:
// RLS (workouts_select_friends m.fl.) räcker för själva passdatan.
export async function fetchFeed(
  client: Client,
  currentUserId: string,
  friends: Friend[],
  cursor: WorkoutHistoryCursor | null,
  limit: number = WORKOUT_HISTORY_PAGE_SIZE,
): Promise<FeedWorkoutEntry[]> {
  if (friends.length === 0) return [];

  const friendById = new Map(friends.map((f) => [f.id, f]));

  let query = client
    .from("workouts")
    .select(
      "id, user_id, name, started_at, ended_at, workout_media(id, media_type, storage_path, added_at, duration_ms), workout_exercises(id, order_index, exercise_id, exercises(name), sets(set_nr, reps, weight_kg)), workout_kudos(user_id)",
    )
    .in(
      "user_id",
      friends.map((f) => f.id),
    )
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(keysetFilter(cursor));
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const friend = friendById.get(row.user_id);
    const kudos: { user_id: string }[] = row.workout_kudos ?? [];
    return {
      ...mapWorkoutHistoryRow(row),
      userId: row.user_id,
      authorDisplayName: friend?.displayName ?? null,
      authorAvatarPath: friend?.avatarPath ?? null,
      kudosGivenByMe: kudos.some((k) => k.user_id === currentUserId),
    };
  });
}

export async function giveKudos(
  client: Client,
  userId: string,
  workoutId: string,
): Promise<void> {
  const { error } = await client
    .from("workout_kudos")
    .upsert({ user_id: userId, workout_id: workoutId });
  if (error) throw error;
}

export async function removeKudos(
  client: Client,
  userId: string,
  workoutId: string,
): Promise<void> {
  const { error } = await client
    .from("workout_kudos")
    .delete()
    .eq("user_id", userId)
    .eq("workout_id", workoutId);
  if (error) throw error;
}
