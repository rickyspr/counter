import type { MediaType } from "@repcount/shared";

// Vad skärmarna faktiskt renderar. En och samma form oavsett var media
// kommer ifrån - den lokala blobben under ett pågående pass, eller
// servern när man tittar på historik - så att MediaStrip och MediaViewer
// bara behöver kunna en sak.
export interface MediaItem {
  id: string;
  mediaType: MediaType;
  // Källan att visa: en `file://`-URI till den lokala kopian, eller en
  // signerad URL från Storage. RN:s Image och expo-videos spelare tar
  // båda utan att veta skillnaden.
  //
  // null betyder "vet inte än" - ett synkat objekt vars signerade URL
  // ännu inte hämtats. Rutan visas då tom istället för att saknas, så
  // att antalet media inte hoppar medan signeringen pågår.
  uri: string | null;
  durationMs: number | null;
  // Ligger kvar i uppladdningskön. Visas med en spinner: filen finns,
  // men den syns inte på andra enheter än.
  pending: boolean;
}

// "0:07", "1:23". Sekunder rundas UPPÅT: en video på 6,4 sekunder som
// visas som "0:06" ser ut att ha tappat slutet.
export function formatMediaDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) return null;
  const totalSeconds = Math.ceil(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
