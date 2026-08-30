import {
  acceptFriendRequest as sharedAccept,
  cancelFriendRequest as sharedCancel,
  declineFriendRequest as sharedDecline,
  listFriends as sharedListFriends,
  listPendingRequests as sharedListPending,
  removeFriend as sharedRemoveFriend,
  searchProfiles as sharedSearchProfiles,
  sendFriendRequest as sharedSendRequest,
} from "@counter/shared";
import { supabase } from "./supabase";

// Vänskapslogiken bor numera i packages/shared/src/data/follows.ts -
// webben har samma vänhantering. Den här filen binder bara den lokala
// supabase-instansen; anropsställena i SocialScreen/FriendsModal m.fl.
// rörs inte.
//
// Vänskap lever fortfarande utanför synk-kön: en vänförfrågan/accept/
// borttagning är en engångshandling som kräver nätverk direkt, utan
// ordningsberoende mot köade pass-actions.

export type {
  Friend,
  FriendRequest,
  ProfileSearchResult,
  Relationship,
} from "@counter/shared";

export const searchProfiles = (query: string) =>
  sharedSearchProfiles(supabase, query);

export const sendFriendRequest = (requesterId: string, addresseeId: string) =>
  sharedSendRequest(supabase, requesterId, addresseeId);

export const listPendingRequests = () => sharedListPending(supabase);

export const acceptFriendRequest = (followId: string) =>
  sharedAccept(supabase, followId);

export const declineFriendRequest = (followId: string) =>
  sharedDecline(supabase, followId);

export const cancelFriendRequest = (followId: string) =>
  sharedCancel(supabase, followId);

export const listFriends = () => sharedListFriends(supabase);

export const removeFriend = (userId: string, otherUserId: string) =>
  sharedRemoveFriend(supabase, userId, otherUserId);
