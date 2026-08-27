import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// The profile lives deliberately OUTSIDE queries.ts. That file opens
// with a rule (see the comment above startWorkout): mutations never
// write straight to Supabase, they go through the sync queue. A profile
// change is a one-off online write that does not belong there - the
// queue's action types are workout-specific, and a profile edit has
// neither ordering dependencies nor anything to replay offline. Its own
// module, so the rule in queries.ts stays true.
//
// The same holds for every field added in
// 20260822100000_profile_details.sql: they are all columns of one row,
// written in one go from a screen that requires a connection.

export interface UserProfile {
  displayName: string | null;
  avatarPath: string | null;
  homeGym: string | null;
  birthDate: string | null;
  bodyWeightKg: number | null;
  heightCm: number | null;
  bio: string | null;
  createdAt: string | null;
}

// What the settings screen may write - everything in UserProfile except
// createdAt, which belongs to the row rather than to the user.
export type ProfileEdits = Omit<UserProfile, "createdAt">;

const EMPTY_PROFILE: UserProfile = {
  displayName: null,
  avatarPath: null,
  homeGym: null,
  birthDate: null,
  bodyWeightKg: null,
  heightCm: null,
  bio: null,
  createdAt: null,
};

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name, avatar_path, home_gym, birth_date, body_weight_kg, height_cm, bio, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  // The on_auth_user_created trigger creates the row at sign-up, but an
  // account that predates that migration has none. maybeSingle() gives
  // null instead of throwing, and the caller falls back on what the
  // auth session knows.
  if (!data) return EMPTY_PROFILE;

  return {
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    homeGym: data.home_gym,
    birthDate: data.birth_date,
    // numeric comes back as a number through PostgREST, but a null must
    // stay a null - Number(null) is 0, and 0 kg is a value the user
    // never entered.
    bodyWeightKg: data.body_weight_kg == null ? null : Number(data.body_weight_kg),
    heightCm: data.height_cm,
    bio: data.bio,
    createdAt: data.created_at,
  };
}

// Writes every editable column at once. One row, one round trip - the
// same reasoning as name and times on "Klar" in EditWorkoutScreen, and
// it is what makes "Avbryt" in the settings screen mean something:
// nothing has been written until Spara.
//
// Fields the caller leaves as null are WRITTEN as null, not skipped.
// That is the point: clearing your home gym has to be possible.
export async function updateProfile(
  userId: string,
  edits: ProfileEdits,
): Promise<void> {
  // Upsert for the same reason as the maybeSingle above: if the row is
  // missing it has to be created. `unit` has a default, so an insert
  // without it still satisfies the check constraint.
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    display_name: edits.displayName,
    avatar_path: edits.avatarPath,
    home_gym: edits.homeGym,
    birth_date: edits.birthDate,
    body_weight_kg: edits.bodyWeightKg,
    height_cm: edits.heightCm,
    bio: edits.bio,
  });
  if (error) throw error;
}

// What to call the user before they have written a display name.
// Google sign-ins get a name for free in user_metadata; email accounts
// have nothing at all until one is typed.
//
// Shared by the profile screen and its settings page so the placeholder
// in the input is the same string the profile actually shows.
export function fallbackDisplayName(session: Session): string {
  return (
    (session.user.user_metadata?.full_name as string | undefined) ??
    session.user.email ??
    "Namnlös"
  );
}

export interface TrainingStats {
  workoutCount: number;
  totalVolumeKg: number;
  totalMinutes: number;
}

// Aggregated in the database (see the 20260820120000_training_stats
// migration) because the alternative is downloading every set - and the
// Data API truncates responses over 1000 rows without saying so.
export async function fetchTrainingStats(): Promise<TrainingStats> {
  const { data, error } = await supabase
    .rpc("get_training_stats")
    .maybeSingle();
  if (error) throw error;

  return {
    workoutCount: Number(data?.workout_count ?? 0),
    totalVolumeKg: Number(data?.total_volume_kg ?? 0),
    totalMinutes: Number(data?.total_minutes ?? 0),
  };
}

// Separate RPC, not get_training_stats(friendId) - see
// 20260827100000_friend_training_stats.sql. get_training_stats() has no
// parameter at all and always means "the caller", so a friend's numbers
// need their own function rather than an argument bolted onto that one.
export async function fetchFriendTrainingStats(
  friendId: string,
): Promise<TrainingStats> {
  const { data, error } = await supabase
    .rpc("get_friend_training_stats", { p_user_id: friendId })
    .maybeSingle();
  if (error) throw error;

  return {
    workoutCount: Number(data?.workout_count ?? 0),
    totalVolumeKg: Number(data?.total_volume_kg ?? 0),
    totalMinutes: Number(data?.total_minutes ?? 0),
  };
}
