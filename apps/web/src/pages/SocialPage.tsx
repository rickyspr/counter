import {
  fetchFeed,
  feedCursorFor,
  giveKudos,
  listFriends,
  removeKudos,
  WORKOUT_HISTORY_PAGE_SIZE,
  type FeedWorkoutEntry,
  type Friend,
  type WorkoutMediaRow,
} from "@counter/shared";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FriendsPanel } from "../components/FriendsPanel";
import { MediaViewer } from "../components/MediaViewer";
import { WorkoutCard } from "../components/WorkoutCard";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { useAuth } from "../lib/auth-context";
import { useMediaSigning } from "../lib/media-signing";
import { supabase } from "../lib/supabase";

export function SocialPage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const navigate = useNavigate();
  const { avatarUrls, signWorkouts, signAvatars, toMediaItems } =
    useMediaSigning();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [feed, setFeed] = useState<FeedWorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<FeedWorkoutEntry | null>(null);
  const [viewer, setViewer] = useState<{
    media: WorkoutMediaRow[];
    index: number;
  } | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const friendList = await listFriends(supabase);
      setFriends(friendList);
      void signAvatars(friendList.map((f) => f.avatarPath));
      const page = await fetchFeed(supabase, userId, friendList, null);
      setFeed(page);
      setReachedEnd(page.length < WORKOUT_HISTORY_PAGE_SIZE);
      void signWorkouts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta flödet.");
    }
    setLoading(false);
  }, [userId, signWorkouts, signAvatars]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadNextPage() {
    if (loadingMore || reachedEnd || loading) return;
    setLoadingMore(true);
    try {
      const next = await fetchFeed(
        supabase,
        userId,
        friends,
        feedCursorFor(feed),
      );
      setFeed((prev) => {
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

  async function toggleKudos(entry: FeedWorkoutEntry) {
    const optimistic: FeedWorkoutEntry = {
      ...entry,
      kudosGivenByMe: !entry.kudosGivenByMe,
      kudosCount: entry.kudosCount + (entry.kudosGivenByMe ? -1 : 1),
    };
    const apply = (e: FeedWorkoutEntry) =>
      setFeed((prev) => prev.map((w) => (w.id === entry.id ? e : w)));
    apply(optimistic);
    setSelected((prev) => (prev?.id === entry.id ? optimistic : prev));
    try {
      if (entry.kudosGivenByMe) {
        await removeKudos(supabase, userId, entry.id);
      } else {
        await giveKudos(supabase, userId, entry.id);
      }
    } catch (err) {
      apply(entry);
      setSelected((prev) => (prev?.id === entry.id ? entry : prev));
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera peppen.");
    }
  }

  const authorFor = (entry: FeedWorkoutEntry) => ({
    name: entry.authorDisplayName ?? "Okänd",
    avatarUrl: entry.authorAvatarPath
      ? (avatarUrls.get(entry.authorAvatarPath) ?? null)
      : null,
    onOpen: () => navigate(`/socialt/${entry.userId}`),
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Socialt</h1>
        <button
          type="button"
          className="button-secondary"
          onClick={() => setPanelOpen(true)}
        >
          Vänner
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      {loading ? (
        <p className="status">Laddar…</p>
      ) : friends.length === 0 ? (
        <p className="status">
          Inga vänner än. Tryck på Vänner för att hitta någon att följa.
        </p>
      ) : feed.length === 0 ? (
        <p className="status">Inga pass från dina vänner än.</p>
      ) : (
        <div className="card-list">
          {feed.map((entry) => (
            <WorkoutCard
              key={entry.id}
              entry={entry}
              mediaItems={toMediaItems(entry.media)}
              author={authorFor(entry)}
              kudos={{
                givenByMe: entry.kudosGivenByMe,
                onToggle: () => void toggleKudos(entry),
              }}
              onOpenDetail={() => setSelected(entry)}
              onOpenMedia={(index) => setViewer({ media: entry.media, index })}
            />
          ))}
        </div>
      )}

      {!loading && !reachedEnd && feed.length > 0 && (
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
        mediaItems={selected ? toMediaItems(selected.media) : []}
        onClose={() => setSelected(null)}
        author={
          selected
            ? {
                ...authorFor(selected),
                onOpen: () => {
                  const id = selected.userId;
                  setSelected(null);
                  navigate(`/socialt/${id}`);
                },
              }
            : undefined
        }
        kudos={
          selected
            ? {
                count: selected.kudosCount,
                givenByMe: selected.kudosGivenByMe,
                onToggle: () => void toggleKudos(selected),
              }
            : undefined
        }
      />

      {viewer && (
        <MediaViewer
          items={toMediaItems(viewer.media)}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}

      {panelOpen && (
        <FriendsPanel
          userId={userId}
          onOpenFriend={(friendId) => {
            setPanelOpen(false);
            navigate(`/socialt/${friendId}`);
          }}
          onClose={() => {
            setPanelOpen(false);
            void loadFirstPage();
          }}
        />
      )}
    </div>
  );
}
