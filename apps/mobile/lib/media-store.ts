import {
  extensionForMimeType,
  MEDIA_FILE_SIZE_LIMIT_BYTES,
  mediaTypeForMimeType,
  mimeTypeForExtension,
  type MediaType,
} from "@repcount/shared";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

// Appens egen kopia av vald media, i väntan på uppladdning.
//
// Att kopiera är inte överflödigt. ImagePicker svarar med en URI in i
// CACHE-katalogen, som systemet får radera när lagringen tryter, och en
// bild som valts ur galleriet kan dessutom ligga bakom en URI som slutar
// gälla när appen startas om. Ett pass kan ligga oskickat i dagar - då
// måste byte:sen vara våra egna.
//
// Paths.document, inte Paths.cache: cachen är precis det systemet städar
// bort, och det som ligger här är det ENDA exemplaret tills uppladdningen
// gått igenom. Filerna är kortlivade (de raderas när uppladdningen
// lyckats) så iCloud-backupen av dokumentkatalogen är inget problem i
// praktiken.
const DIRECTORY_NAME = "workout-media";

function mediaDirectory(): Directory {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  // `intermediates` behövs inte för en katalog direkt under document,
  // men `create` kastar om katalogen redan finns - därav vakten.
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

// Delmängden av ImagePickerAsset som faktiskt används. En egen typ i
// stället för ImagePickers, så att den här modulen går att resonera om
// (och byta väljare i) utan att dra in hela expo-image-picker.
export interface PickedAsset {
  uri: string;
  mimeType?: string | null;
  type?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fileName?: string | null;
}

export interface ImportedMedia {
  mediaId: string;
  localUri: string;
  extension: string;
  mimeType: string;
  mediaType: MediaType;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  bytes: number;
}

// ImagePicker svarar inte alltid med mimeType - på Android är det ofta
// null. Faller då tillbaka på filens ändelse, och sist på `type`
// ("image"/"video"), som alltid finns.
function resolveMimeType(asset: PickedAsset, source: File): string | null {
  const direct = mediaTypeForMimeType(asset.mimeType) ? asset.mimeType : null;
  if (direct) return direct;

  const fromExtension = mimeTypeForExtension(source.extension);
  if (fromExtension) return fromExtension;

  // Sista utvägen. jpeg respektive mp4 är vad plattformarna faktiskt
  // levererar när de inte säger något - och skulle gissningen bli fel
  // är den ändå bara en etikett: Storage validerar mot bucketens
  // allowed_mime_types, inte mot filens innehåll.
  if (asset.type === "image") return "image/jpeg";
  if (asset.type === "video") return "video/mp4";
  return null;
}

// Kastar med ett meddelande som går att visa rakt av: allt det här
// händer som direkt svar på att användaren valt en fil, så ett fel hör
// hemma i en dialog och inte i en tyst logg.
export async function importPickedAsset(
  asset: PickedAsset,
): Promise<ImportedMedia> {
  const source = new File(asset.uri);
  const mimeType = resolveMimeType(asset, source);
  const mediaType = mediaTypeForMimeType(mimeType);
  const extension = extensionForMimeType(mimeType);
  if (!mimeType || !mediaType || !extension) {
    throw new Error("Filtypen stöds inte. Välj en bild eller en video.");
  }

  // Kontrolleras HÄR och inte först vid uppladdningen. Bucketens
  // file_size_limit avvisar en för stor fil med en permanent 4xx, och
  // ett permanent fel i uppladdningskön kan inte försökas om - filen
  // hade alltså tyst blivit liggande. Bättre att säga ifrån direkt.
  if (source.size > MEDIA_FILE_SIZE_LIMIT_BYTES) {
    const limitMb = Math.round(MEDIA_FILE_SIZE_LIMIT_BYTES / (1024 * 1024));
    throw new Error(`Filen är för stor. Max ${limitMb} MB.`);
  }

  const mediaId = Crypto.randomUUID();
  const target = new File(mediaDirectory(), `${mediaId}.${extension}`);
  await source.copy(target);

  return {
    mediaId,
    localUri: target.uri,
    extension,
    mimeType,
    mediaType,
    // ImagePicker ger 0 för det den inte vet. Kolumnerna har
    // check-villkor på > 0, och ett brutet villkor ger 23514 - permanent
    // fel, alltså en mediarad som synk-kön slänger. Normaliseras till
    // null redan här.
    width: positiveOrNull(asset.width),
    height: positiveOrNull(asset.height),
    // `duration` är millisekunder för video och null för bild.
    durationMs: asset.duration != null ? Math.max(0, Math.round(asset.duration)) : null,
    bytes: target.size,
  };
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && value > 0 ? Math.round(value) : null;
}

// Tål att filen redan är borta: raderingen anropas både när en
// uppladdning lyckats och när användaren ångrar sig, och de två kan
// mötas.
export function deleteLocalMedia(localUri: string): void {
  try {
    const file = new File(localUri);
    if (file.exists) file.delete();
  } catch {
    // En fil som inte går att radera är slöseri med utrymme, inte ett
    // fel användaren kan göra något åt.
  }
}

// Städar filer som ingen längre håller reda på.
//
// Dör appen mellan en lyckad uppladdning och raderingen av den lokala
// kopian ligger filen kvar utan att något jobb pekar på den. Körs vid
// appstart med de id:n uppladdningskön fortfarande känner till.
export function sweepOrphanedMedia(keepMediaIds: Set<string>): void {
  try {
    for (const entry of mediaDirectory().list()) {
      if (!(entry instanceof File)) continue;
      // Filnamnet ÄR media-id:t plus ändelse - se importPickedAsset.
      const mediaId = entry.name.replace(/\.[^.]*$/, "");
      if (!keepMediaIds.has(mediaId)) entry.delete();
    }
  } catch {
    // Städning får aldrig hindra appen från att starta.
  }
}
