import {
  clearMediaUrlCache as sharedClear,
  signAvatarUrl as sharedSignAvatarUrl,
  signMediaUrls as sharedSignMediaUrls,
} from "@repcount/shared";
import { supabase } from "./supabase";

// Signeringen och dess minnescache bor numera i
// packages/shared/src/data/media-urls.ts - webben visar samma media. Den
// här filen binder bara den lokala supabase-instansen, så att skärmarnas
// befintliga import (`from "../lib/media-urls"`) inte behöver röras.

export const signMediaUrls = (paths: string[]) =>
  sharedSignMediaUrls(supabase, paths);

export const signAvatarUrl = (path: string) =>
  sharedSignAvatarUrl(supabase, path);

export const clearMediaUrlCache = sharedClear;
