import {
  signAvatarUrl as sharedSignAvatarUrl,
  signMediaUrls as sharedSignMediaUrls,
} from "@repcount/shared";
import { supabase } from "./supabase";

// The signing logic and its in-memory TTL cache live in
// packages/shared/src/data/media-urls.ts (mobile shows the same media).
// This binds the web supabase client.

export const signMediaUrls = (paths: string[]) =>
  sharedSignMediaUrls(supabase, paths);

export const signAvatarUrl = (path: string) =>
  sharedSignAvatarUrl(supabase, path);
