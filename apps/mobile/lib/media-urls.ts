import { WORKOUT_MEDIA_BUCKET } from "@repcount/shared";
import { supabase } from "./supabase";

// Bucketen är privat (se 20260822090100_workout_media_storage.sql), så
// varje visning kräver en signerad URL. De hämtas i klump - ett anrop
// per skärm, inte ett per bild - och sparas tills de närmar sig sitt
// utgångsdatum.
//
// Cachen ligger bara i minnet. En signerad URL som skrivits till disk
// hade varit en läsbar länk till användarens media utan inloggning, och
// den vinsten är inte värd det: att signera om är ett enda anrop.
const TTL_SECONDS = 60 * 60;

// Marginal så att en URL inte hinner gå ut mellan att den delas ut och
// att bilden faktiskt laddas - särskilt en video som spelas en stund.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();

// Svarar med en karta från storage_path till signerad URL. Sökvägar som
// inte gick att signera SAKNAS i kartan istället för att kasta: en
// enstaka trasig bild ska inte tömma ett helt pass på media.
export async function signMediaUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const now = Date.now();
  const signed = new Map<string, string>();
  const missing = new Set<string>();

  for (const path of paths) {
    const hit = cache.get(path);
    if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now) {
      signed.set(path, hit.url);
    } else {
      missing.add(path);
    }
  }
  if (missing.size === 0) return signed;

  const { data, error } = await supabase.storage
    .from(WORKOUT_MEDIA_BUCKET)
    .createSignedUrls([...missing], TTL_SECONDS);
  if (error) throw error;

  const expiresAt = now + TTL_SECONDS * 1000;
  for (const row of data ?? []) {
    if (!row.path || !row.signedUrl) continue;
    cache.set(row.path, { url: row.signedUrl, expiresAt });
    signed.set(row.path, row.signedUrl);
  }
  return signed;
}

// Vid utloggning. URL:erna hör till den som var inloggad, och nästa
// användares media ligger under andra sökvägar - men att låta dem ligga
// kvar i minnet är onödigt.
export function clearMediaUrlCache(): void {
  cache.clear();
}
