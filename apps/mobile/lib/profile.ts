import {
  fetchProfile as sharedFetchProfile,
  fetchFriendTrainingStats as sharedFetchFriendStats,
  fetchTrainingStats as sharedFetchStats,
  type Unit,
  type UserProfile,
} from "@counter/shared";
import { supabase } from "./supabase";

// The read half of the profile (fetchProfile, the training-stats RPCs,
// fallbackDisplayName, the types) now lives in
// packages/shared/src/data/profile.ts - the web reads the same rows.
// This file binds the local supabase client and keeps the WRITE path,
// which stays mobile-only: the web profile is read-only.
//
// updateProfile lives deliberately outside queries.ts / the sync queue:
// a profile change is a one-off online write with no ordering
// dependencies and nothing to replay offline. Its own module, so the
// rule in queries.ts (mutations only go through the queue) stays true.

export { fallbackDisplayName, type UserProfile, type TrainingStats } from "@counter/shared";

// What the profile-details screen may write - everything in UserProfile
// except createdAt (belongs to the row) and unit/unitChosenAt, which the
// Settings screen owns through updateUnitPreference below.
export type ProfileEdits = Omit<
  UserProfile,
  "createdAt" | "unit" | "unitChosenAt"
>;

export const fetchProfile = (userId: string) =>
  sharedFetchProfile(supabase, userId);

export const fetchTrainingStats = () => sharedFetchStats(supabase);

export const fetchFriendTrainingStats = (friendId: string) =>
  sharedFetchFriendStats(supabase, friendId);

// Writes every editable column at once. One row, one round trip - it is
// what makes "Avbryt" in the settings screen mean something: nothing has
// been written until Spara.
//
// Fields the caller leaves as null are WRITTEN as null, not skipped.
// That is the point: clearing your home gym has to be possible.
export async function updateProfile(
  userId: string,
  edits: ProfileEdits,
): Promise<void> {
  // Upsert: an account predating the on_auth_user_created trigger has no
  // row. `unit` has a default, so an insert without it still satisfies
  // the check constraint.
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

// The unit preference is written on its own, from the Settings screen -
// a partial upsert cannot null the rest of the profile, and it must not.
// `upsert` (not `update`) for accounts predating the
// on_auth_user_created trigger. Outside the sync queue for the same
// reason as updateProfile: a one-off online write with no ordering.
export async function updateUnitPreference(
  userId: string,
  unit: Unit,
): Promise<void> {
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    unit,
    unit_chosen_at: new Date().toISOString(),
  });
  if (error) throw error;
}
