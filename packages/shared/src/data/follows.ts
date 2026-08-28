import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;

// Vänskap lever deliberately utanför mobilens synk-kö: en
// vänförfrågan/accept/borttagning är en engångshandling som kräver
// nätverk direkt, utan ordningsberoende mot köade pass-actions och
// inget att spela upp offline.

export type Relationship =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "friends";

export interface ProfileSearchResult {
  id: string;
  displayName: string | null;
  relationship: Relationship;
}

// Kräver minst två tecken - samma gräns som search_profiles()-funktionen
// i databasen har, så ett kort anrop aldrig ens görs.
export async function searchProfiles(
  client: Client,
  query: string,
): Promise<ProfileSearchResult[]> {
  if (query.trim().length < 2) return [];

  const { data, error } = await client.rpc("search_profiles", { query });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    relationship: row.relationship as Relationship,
  }));
}

export async function sendFriendRequest(
  client: Client,
  requesterId: string,
  addresseeId: string,
): Promise<void> {
  const { error } = await client
    .from("follows")
    .insert({ requester_id: requesterId, addressee_id: addresseeId });
  if (error) throw error;
}

export interface FriendRequest {
  followId: string;
  direction: "incoming" | "outgoing";
  otherId: string;
  displayName: string | null;
  createdAt: string;
}

export async function listPendingRequests(
  client: Client,
): Promise<FriendRequest[]> {
  const { data, error } = await client.rpc("list_pending_requests");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    followId: row.follow_id,
    direction: row.direction as "incoming" | "outgoing",
    otherId: row.other_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  }));
}

export async function acceptFriendRequest(
  client: Client,
  followId: string,
): Promise<void> {
  const { error } = await client
    .from("follows")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", followId);
  if (error) throw error;
}

// Avslag (mottagaren) och avbrytande (avsändaren) är samma operation på
// databasnivå - en DELETE av raden, tillåtet av follows_delete_participant
// för endera parten.
async function deleteFollow(client: Client, followId: string): Promise<void> {
  const { error } = await client.from("follows").delete().eq("id", followId);
  if (error) throw error;
}

export const declineFriendRequest = deleteFollow;
export const cancelFriendRequest = deleteFollow;

export interface Friend {
  id: string;
  displayName: string | null;
  avatarPath: string | null;
  homeGym: string | null;
  bio: string | null;
  friendsSince: string | null;
}

export async function listFriends(client: Client): Promise<Friend[]> {
  const { data, error } = await client.rpc("list_friends");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    homeGym: row.home_gym,
    bio: row.bio,
    friendsSince: row.friends_since,
  }));
}

// Tar bort en accepterad vänskap. Radar bara EN rad eftersom follows har
// en rad per PAR (pair_low/pair_high) - riktningen spelar ingen roll för
// borttagning, bara att man är en av parterna.
export async function removeFriend(
  client: Client,
  userId: string,
  otherUserId: string,
): Promise<void> {
  const { error } = await client
    .from("follows")
    .delete()
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`,
    );
  if (error) throw error;
}
