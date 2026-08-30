import {
  cursorFor,
  fetchWorkoutHistory,
  WORKOUT_HISTORY_PAGE_SIZE,
  type WorkoutHistoryEntry,
  type WorkoutMediaRow,
} from "@counter/shared";
import { useCallback, useEffect, useState } from "react";
import { MediaViewer } from "../components/MediaViewer";
import { WorkoutCard } from "../components/WorkoutCard";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { useAuth } from "../lib/auth-context";
import { useMediaSigning } from "../lib/media-signing";
import { supabase } from "../lib/supabase";

export function HistoryPage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { signWorkouts, toMediaItems } = useMediaSigning();

  const [workouts, setWorkouts] = useState<WorkoutHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WorkoutHistoryEntry | null>(null);
  const [viewer, setViewer] = useState<{
    media: WorkoutMediaRow[];
    index: number;
  } | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchWorkoutHistory(supabase, userId, null);
      setWorkouts(page);
      setReachedEnd(page.length < WORKOUT_HISTORY_PAGE_SIZE);
      void signWorkouts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta historiken.");
    }
    setLoading(false);
  }, [userId, signWorkouts]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadNextPage() {
    if (loadingMore || reachedEnd || loading) return;
    setLoadingMore(true);
    try {
      const next = await fetchWorkoutHistory(
        supabase,
        userId,
        cursorFor(workouts),
      );
      setWorkouts((prev) => {
        const seen = new Set(prev.map((w) => w.id));
        return [...prev, ...next.filter((w) => !seen.has(w.id))];
      });
      void signWorkouts(next);
      if (next.length < WORKOUT_HISTORY_PAGE_SIZE) setReachedEnd(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta fler pass.");
    }
    setLoadingMore(false);
  }

  const selectedMedia = selected ? toMediaItems(selected.media) : [];

  return (
    <div className="page">
      <h1>Mina pass</h1>

      {error && <p className="status error">{error}</p>}

      {loading ? (
        <p className="status">Laddar…</p>
      ) : workouts.length === 0 ? (
        <p className="status">
          Inga avslutade pass ännu. Logga ett pass i mobilappen.
        </p>
      ) : (
        <div className="card-list">
          {workouts.map((w) => {
            const mediaItems = toMediaItems(w.media);
            return (
              <WorkoutCard
                key={w.id}
                entry={w}
                mediaItems={mediaItems}
                onOpenDetail={() => setSelected(w)}
                onOpenMedia={(index) => setViewer({ media: w.media, index })}
              />
            );
          })}
        </div>
      )}

      {!loading && !reachedEnd && workouts.length > 0 && (
        <button
          type="button"
          className="button-secondary load-more"
          onClick={() => void loadNextPage()}
          disabled={loadingMore}
        >
          {loadingMore ? "Laddar…" : "Ladda fler"}
        </button>
      )}

      <WorkoutDetailModal
        entry={selected}
        mediaItems={selectedMedia}
        onClose={() => setSelected(null)}
      />

      {viewer && (
        <MediaViewer
          items={toMediaItems(viewer.media)}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
