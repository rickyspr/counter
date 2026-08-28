import type { MediaItem, WorkoutMediaRow } from "@repcount/shared";
import { useCallback, useState } from "react";
import { signAvatarUrl, signMediaUrls } from "./media-urls";

interface HasMedia {
  media: WorkoutMediaRow[];
}

// One place for the "sign a page of workout media + author avatars right
// after it loads" pattern that every list screen shares (mirrors
// ProfileScreen.signPage on mobile). Failures are swallowed - a missing
// signed URL renders as an empty tile, never an error the user could act
// on.
export function useMediaSigning() {
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [avatarUrls, setAvatarUrls] = useState<Map<string, string>>(new Map());

  const signWorkouts = useCallback(async (entries: HasMedia[]) => {
    const paths = entries.flatMap((e) => e.media.map((m) => m.storagePath));
    if (paths.length === 0) return;
    try {
      const signed = await signMediaUrls(paths);
      setMediaUrls((prev) => {
        const next = new Map(prev);
        for (const [path, url] of signed) next.set(path, url);
        return next;
      });
    } catch {
      // supporting, never surfaced
    }
  }, []);

  const signAvatars = useCallback(
    async (paths: (string | null | undefined)[]) => {
      const unique = [...new Set(paths.filter((p): p is string => !!p))];
      for (const path of unique) {
        const url = await signAvatarUrl(path).catch(() => null);
        if (url) setAvatarUrls((prev) => new Map(prev).set(path, url));
      }
    },
    [],
  );

  const toMediaItems = useCallback(
    (media: WorkoutMediaRow[]): MediaItem[] =>
      media.map((m) => ({
        id: m.id,
        mediaType: m.mediaType,
        uri: mediaUrls.get(m.storagePath) ?? null,
        durationMs: m.durationMs,
        pending: false,
      })),
    [mediaUrls],
  );

  return { mediaUrls, avatarUrls, signWorkouts, signAvatars, toMediaItems };
}
