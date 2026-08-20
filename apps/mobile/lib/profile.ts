import { supabase } from "./supabase";

// Profilen ligger medvetet UTANFÖR queries.ts. Den filen inleds med en
// regel (se kommentaren över startWorkout): mutationer skriver aldrig
// direkt mot Supabase utan går via synk-kön. Ett namnbyte är en
// online-only engångsskrivning som inte hör hemma i kön - dess
// åtgärdstyper är pass-specifika, och en profiländring har varken
// ordningsberoenden eller något att spela upp offline. Egen modul, så
// att queries.ts regel förblir sann.

export interface UserProfile {
  displayName: string | null;
  createdAt: string | null;
}

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  // Triggern on_auth_user_created skapar raden vid registrering, men ett
  // konto som fanns före den migrationen saknar den. maybeSingle() ger
  // null istället för att kasta, och anroparen får falla tillbaka på
  // uppgifterna i auth-sessionen.
  return {
    displayName: data?.display_name ?? null,
    createdAt: data?.created_at ?? null,
  };
}

export async function updateDisplayName(
  userId: string,
  name: string,
): Promise<string | null> {
  // Tomt fält betyder "inget eget namn", inte tomma strängen - då faller
  // visningen tillbaka på e-postadressen.
  const trimmed = name.trim();
  const displayName = trimmed === "" ? null : trimmed;

  // Upsert av samma skäl som maybeSingle ovan: saknas raden ska den
  // skapas. `unit` har ett default, så en insert med bara id och namn
  // går igenom check-villkoret.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName });
  if (error) throw error;

  return displayName;
}

export interface TrainingStats {
  workoutCount: number;
  totalVolumeKg: number;
  totalMinutes: number;
}

// Aggregeras i databasen (se migrationen 20260820120000_training_stats)
// eftersom det annars kräver att varje set laddas ner - och Data API:t
// kapar svar över 1000 rader utan att säga till.
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
