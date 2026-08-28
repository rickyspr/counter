import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKOUT_MEDIA_BUCKET } from "../media";
import { AVATAR_BUCKET } from "../profile";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;

// Buckets `workout-media` och `avatars` är privata (se
// 20260822090100_workout_media_storage.sql /
// 20260822100100_avatars_storage.sql), så varje visning kräver en
// signerad URL. De hämtas i klump - ett anrop per skärm, inte ett per
// bild - och sparas tills de närmar sig sitt utgångsdatum.
//
// Cachen ligger bara i minnet. En signerad URL som skrivits till disk
// hade varit en läsbar länk till användarens media utan inloggning, och
// den vinsten är inte värd det: att signera om är ett enda anrop.
//
// Ligger i shared eftersom både mobilen och webben visar samma media.
// Klienten skickas in - varje app har sin egen supabase-instans.

const TTL_SECONDS = 60 * 60;

// Marginal så att en URL inte hinner gå ut mellan att den delas ut och
// att bilden faktiskt laddas - särskilt en video som spelas en stund.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Keyed by `${bucket}:${path}`, not by path alone. Two buckets share
// this cache and a path is only unique within one of them.
const cache = new Map<string, { url: string; expiresAt: number }>();

async function sign(
  client: Client,
  bucket: string,
  paths: string[],
): Promise<Map<string, string>> {
  const now = Date.now();
  const signed = new Map<string, string>();
  const missing = new Set<string>();

  for (const path of paths) {
    const hit = cache.get(`${bucket}:${path}`);
    if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now) {
      signed.set(path, hit.url);
    } else {
      missing.add(path);
    }
  }
  if (missing.size === 0) return signed;

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrls([...missing], TTL_SECONDS);
  if (error) throw error;

  const expiresAt = now + TTL_SECONDS * 1000;
  for (const row of data ?? []) {
    if (!row.path || !row.signedUrl) continue;
    cache.set(`${bucket}:${row.path}`, { url: row.signedUrl, expiresAt });
    signed.set(row.path, row.signedUrl);
  }
  return signed;
}

// Svarar med en karta från storage_path till signerad URL. Sökvägar som
// inte gick att signera SAKNAS i kartan istället för att kasta: en
// enstaka trasig bild ska inte tömma ett helt pass på media.
export async function signMediaUrls(
  client: Client,
  paths: string[],
): Promise<Map<string, string>> {
  return sign(client, WORKOUT_MEDIA_BUCKET, paths);
}

// Avataren kommer en i taget och från en annan bucket, men cachningen är
// samma problem. Null istället för ett kast när sökvägen inte går att
// signera: en avatar som inte laddar är en saknad bild, aldrig ett skäl
// att fälla profilen runt den.
export async function signAvatarUrl(
  client: Client,
  path: string,
): Promise<string | null> {
  const signed = await sign(client, AVATAR_BUCKET, [path]);
  return signed.get(path) ?? null;
}

// Vid utloggning. URL:erna hör till den som var inloggad.
export function clearMediaUrlCache(): void {
  cache.clear();
}
