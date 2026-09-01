import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { Unit } from "../types";

type Client = SupabaseClient<Database>;

// Profilen läses härifrån av både mobilen och webben. Skrivningen
// (updateProfile) lever kvar i appen: webbens profil är read-only.

export interface UserProfile {
  displayName: string | null;
  avatarPath: string | null;
  homeGym: string | null;
  birthDate: string | null;
  bodyWeightKg: number | null;
  heightCm: number | null;
  bio: string | null;
  unit: Unit;
  // null tills användaren tagit ställning - då sätter klienten
  // regionsdefaulten en gång. Se 20260901090000_profile_unit_chosen_at.sql.
  unitChosenAt: string | null;
  createdAt: string | null;
}

export const EMPTY_PROFILE: UserProfile = {
  displayName: null,
  avatarPath: null,
  homeGym: null,
  birthDate: null,
  bodyWeightKg: null,
  heightCm: null,
  bio: null,
  unit: "kg",
  unitChosenAt: null,
  createdAt: null,
};

export async function fetchProfile(
  client: Client,
  userId: string,
): Promise<UserProfile> {
  const { data, error } = await client
    .from("profiles")
    .select(
      "display_name, avatar_path, home_gym, birth_date, body_weight_kg, height_cm, bio, unit, unit_chosen_at, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  // Ett konto som föregår on_auth_user_created-triggern har ingen rad.
  // maybeSingle() ger null istället för att kasta, och anroparen faller
  // tillbaka på vad auth-sessionen vet.
  if (!data) return EMPTY_PROFILE;

  return {
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    homeGym: data.home_gym,
    birthDate: data.birth_date,
    // numeric kommer tillbaka som number via PostgREST, men null måste
    // förbli null - Number(null) är 0, och 0 kg är ett värde användaren
    // aldrig matat in.
    bodyWeightKg: data.body_weight_kg == null ? null : Number(data.body_weight_kg),
    heightCm: data.height_cm,
    bio: data.bio,
    unit: data.unit === "lbs" ? "lbs" : "kg",
    unitChosenAt: data.unit_chosen_at,
    createdAt: data.created_at,
  };
}

// Vad man kallar användaren innan hen skrivit ett visningsnamn. Google-
// inloggningar får ett namn gratis i user_metadata; e-postkonton har
// ingenting alls förrän ett skrivs.
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

// Aggregeras i databasen (get_training_stats) eftersom alternativet är
// att ladda ner varje set - och Data API:t trunkerar svar över 1000
// rader utan att säga till.
export async function fetchTrainingStats(client: Client): Promise<TrainingStats> {
  const { data, error } = await client.rpc("get_training_stats").maybeSingle();
  if (error) throw error;

  return {
    workoutCount: Number(data?.workout_count ?? 0),
    totalVolumeKg: Number(data?.total_volume_kg ?? 0),
    totalMinutes: Number(data?.total_minutes ?? 0),
  };
}

// Separat RPC, inte get_training_stats(friendId) - den har ingen
// parameter alls och betyder alltid "anroparen".
export async function fetchFriendTrainingStats(
  client: Client,
  friendId: string,
): Promise<TrainingStats> {
  const { data, error } = await client
    .rpc("get_friend_training_stats", { p_user_id: friendId })
    .maybeSingle();
  if (error) throw error;

  return {
    workoutCount: Number(data?.workout_count ?? 0),
    totalVolumeKg: Number(data?.total_volume_kg ?? 0),
    totalMinutes: Number(data?.total_minutes ?? 0),
  };
}
