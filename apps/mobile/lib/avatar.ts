import { AVATAR_BUCKET, avatarStoragePath } from "@repcount/shared";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import type { PickedProfileImage } from "./media-picker";
import { supabase } from "./supabase";

// The bytes behind profiles.avatar_path.
//
// Deliberately NOT routed through media-queue.ts. That queue exists for
// three properties an avatar does not have: files large enough that
// re-serialising the sync queue around them hurts, uploads that must
// survive being offline for days, and a video at the head that must not
// block the sets behind it. A profile picture is a small image written
// from a screen that already requires a connection, so it is a plain
// awaited call whose failure the user sees immediately.
//
// That also means supabase-js can be used here, which media-queue.ts
// cannot: its upload() wants the whole file in memory. For a cropped,
// compressed avatar that is a few hundred kilobytes.

export async function uploadAvatar(
  userId: string,
  picked: PickedProfileImage,
): Promise<string> {
  const file = new File(picked.localUri);
  if (!file.exists) {
    // The picker's URI points into the system cache. The window between
    // picking and saving is seconds, but if the file is gone it is gone
    // - better to say so than to write a path to nothing.
    throw new Error("Bilden finns inte kvar. Välj den igen.");
  }

  // A fresh id per upload, never a stable {user_id}.jpg: both the
  // signed-URL cache (keyed by path) and React Native's Image cache
  // (keyed by URI) would keep showing the old picture otherwise.
  const path = avatarStoragePath(userId, Crypto.randomUUID(), picked.extension);

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: picked.mimeType,
      // The path is unique, so this never overwrites anyone. It is here
      // for the retry after a lost response, which would otherwise come
      // back as a 409 on an object we ourselves just wrote.
      upsert: true,
    });
  if (error) throw error;

  return path;
}

// Best effort, by design. Used both to clear the previous avatar after
// a new one has been written and to clean up an upload whose profile
// row never made it - in neither case is there anything the user can do
// about a failure, and in neither case is their current picture at
// risk. The cost of losing is one orphaned object.
export async function deleteAvatarObject(path: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // Nothing to report: this file is already unreachable from the
    // profile row.
  }
}
