// Gemensamma regler för media (bilder/video) på ett pass.
//
// Ligger i shared av samma skäl som workout-name.ts: värdena hamnar i
// databasen respektive i Storage-sökvägar och är alltså inte ren
// presentation. Webben visar inte media än, men läser samma pass.

export const WORKOUT_MEDIA_BUCKET = "workout-media";

export type MediaType = "image" | "video";

// Speglar `allowed_mime_types` i migrationen
// 20260822090100_workout_media_storage.sql. Håll listorna i takt: en
// typ som saknas där avvisas av Storage med en permanent 4xx, och då
// kan uppladdningskön inte försöka om.
const MIME_TYPES: Record<string, { mediaType: MediaType; extension: string }> = {
  "image/jpeg": { mediaType: "image", extension: "jpg" },
  "image/png": { mediaType: "image", extension: "png" },
  "image/heic": { mediaType: "image", extension: "heic" },
  "image/heif": { mediaType: "image", extension: "heif" },
  "video/mp4": { mediaType: "video", extension: "mp4" },
  // iOS spelar in .mov, inte .mp4.
  "video/quicktime": { mediaType: "video", extension: "mov" },
};

export const ALLOWED_MEDIA_MIME_TYPES: readonly string[] = Object.keys(MIME_TYPES);

// Speglar `file_size_limit` på bucketen. Kontrolleras i appen INNAN
// filen köas, så att användaren får ett begripligt meddelande direkt
// istället för en tyst permanent uppladdning som misslyckas senare.
export const MEDIA_FILE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

// Videon kapas redan vid inspelning/valet (videoMaxDuration), så det
// här är taket som gör att storleksgränsen ovan går att hålla.
export const MAX_VIDEO_DURATION_SECONDS = 30;

// Bilder komprimeras av ImagePicker vid valet. 0.7 tar en typisk
// telefonbild från flera MB till några hundra kB utan synlig skillnad i
// en mediaremsa.
export const MEDIA_IMAGE_QUALITY = 0.7;

// Taket per pass är MEDVETET ingen check-constraint i databasen. Ett
// brutet villkor ger 23514, som synk-kön klassar som permanent och
// alltså SLÄNGER - användarens bild hade försvunnit utan att hen fick
// veta varför. Samma resonemang som workouts_name_length i
// 20260821090000_workout_name.sql: gränsen hålls i UI:t.
export const MAX_MEDIA_PER_WORKOUT = 10;

// Båda returnerar null för en okänd eller saknad typ. ImagePicker svarar
// inte alltid med mimeType, så anroparen får falla tillbaka på filens
// ändelse - därför null istället för ett kastat fel.
export function mediaTypeForMimeType(
  mimeType: string | null | undefined,
): MediaType | null {
  return normalize(mimeType)?.mediaType ?? null;
}

export function extensionForMimeType(
  mimeType: string | null | undefined,
): string | null {
  return normalize(mimeType)?.extension ?? null;
}

// Åt andra hållet, för när ImagePicker svarar utan mimeType och allt vi
// har är filens namn. Ledande punkt och versaler tolereras: värdet
// kommer ofta från Expos File.extension (".MOV").
export function mimeTypeForExtension(
  extension: string | null | undefined,
): string | null {
  if (!extension) return null;
  const clean = extension.replace(/^\.+/, "").toLowerCase();
  const match = Object.entries(MIME_TYPES).find(
    ([, value]) => value.extension === clean,
  );
  return match?.[0] ?? null;
}

// "IMAGE/JPEG" och "image/jpeg; charset=binary" är samma typ. Servrar
// och plattformar är inte överens om vare sig versaler eller
// parametrar, och en miss här hade blivit ett avvisat objekt.
function normalize(
  mimeType: string | null | undefined,
): { mediaType: MediaType; extension: string } | undefined {
  if (!mimeType) return undefined;
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  return MIME_TYPES[base];
}

// Sökvägen i bucketen. user_id ligger FÖRST för att Storage-policyerna
// ska kunna avgöra ägarskap ur namnet utan en tabellslagning - se
// 20260822090100_workout_media_storage.sql. Det är ett krav, inte en
// optimering: byte:sen laddas upp innan passets rad hunnit synkas.
export function mediaStoragePath(
  userId: string,
  workoutId: string,
  mediaId: string,
  extension: string,
): string {
  // Expos File.extension svarar med ledande punkt (".jpg"), MIME-
  // tabellen ovan utan. Normaliseras här så att anroparen slipper bry
  // sig - en dubbelpunkt hade gett en fil som inte matchar raden i
  // workout_media.storage_path.
  const clean = extension.replace(/^\.+/, "").toLowerCase();
  return `${userId}/${workoutId}/${mediaId}.${clean}`;
}
