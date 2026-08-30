import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  keysetFilter,
  mapWorkoutHistoryRow,
  type WorkoutHistoryCursor,
  type WorkoutHistoryEntry,
} from "./workout-history";

type Client = SupabaseClient<Database>;

// Läsvägen för CSV-exporten (webbens profilsida). Rent select - inga
// skrivningar, ingen RPC. Återanvänder mapWorkoutHistoryRow, så media
// och kudos utelämnas medvetet ur selecten (mappern ger media: [] och
// kudosCount: 0).
//
// Inga tester här - kräver en kedjemockad klient. Den testbara logiken
// (CSV, lokal tid, keyset-uttrycket) är utbruten.

export const WORKOUT_EXPORT_PAGE_SIZE = 20;

export interface ExportDateRange {
  fromIso: string; // inklusiv, från localDayStartIso
  toExclusiveIso: string; // exklusiv, från localDayEndExclusiveIso
}

// Matchar strukturen i fetchWorkoutHistory-selecten, utan media/kudos och
// med muscle_group tillagt.
const EXPORT_SELECT =
  "id, name, started_at, ended_at, workout_exercises(id, order_index, exercise_id, exercises(name, muscle_group), sets(set_nr, reps, weight_kg))";

// Itererar alla avslutade pass i intervallet, keyset-paginerat om 20 pass
// för att undvika Data API:ts tysta 1000-radersgräns. onPage anropas en
// gång per sida med sidan och totalt inlästa pass så här långt.
//
// Ingen dedupe eller loopvakt behövs: (started_at, id) är strikt
// avtagande sida för sida, så cursorn rör sig alltid framåt.
export async function fetchWorkoutsInRange(
  client: Client,
  userId: string,
  range: ExportDateRange,
  onPage: (page: WorkoutHistoryEntry[], loadedTotal: number) => void,
  options?: { isCancelled?: () => boolean },
): Promise<void> {
  let cursor: WorkoutHistoryCursor | null = null;
  let loadedTotal = 0;

  for (;;) {
    if (options?.isCancelled?.()) return;

    let query = client
      .from("workouts")
      .select(EXPORT_SELECT)
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .gte("started_at", range.fromIso)
      .lt("started_at", range.toExclusiveIso)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(WORKOUT_EXPORT_PAGE_SIZE);

    if (cursor) {
      query = query.or(keysetFilter(cursor));
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []).map(mapWorkoutHistoryRow);
    loadedTotal += page.length;
    onPage(page, loadedTotal);

    if (page.length < WORKOUT_EXPORT_PAGE_SIZE) return;

    const last = page[page.length - 1];
    if (!last) return;
    cursor = { startedAt: last.startedAt, id: last.id };
  }
}

// Starttiden på användarens första avslutade pass - webbens profilsida
// förifyller exportens från-datum med den.
export async function fetchFirstWorkoutStartedAt(
  client: Client,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("workouts")
    .select("started_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.started_at ?? null;
}
