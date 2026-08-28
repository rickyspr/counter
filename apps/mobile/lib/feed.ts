import {
  fetchFeed as sharedFetchFeed,
  giveKudos as sharedGiveKudos,
  removeKudos as sharedRemoveKudos,
  type Friend,
  type WorkoutHistoryCursor,
} from "@repcount/shared";
import { supabase } from "./supabase";

// Flödeslogiken bor numera i packages/shared/src/data/feed.ts - webben
// har samma flöde. Den här filen binder bara den lokala supabase-
// instansen.
//
// Flödet är en flera-användare-fråga, kräver alltid nätverk och gör
// aldrig skrivningar via synk-kön - kudos är, precis som en vänförfrågan,
// en engångshandling utan ordningsberoende mot köade actions.

export { feedCursorFor, type FeedWorkoutEntry } from "@repcount/shared";

export const fetchFeed = (
  currentUserId: string,
  friends: Friend[],
  cursor: WorkoutHistoryCursor | null,
  limit?: number,
) => sharedFetchFeed(supabase, currentUserId, friends, cursor, limit);

export const giveKudos = (userId: string, workoutId: string) =>
  sharedGiveKudos(supabase, userId, workoutId);

export const removeKudos = (userId: string, workoutId: string) =>
  sharedRemoveKudos(supabase, userId, workoutId);
