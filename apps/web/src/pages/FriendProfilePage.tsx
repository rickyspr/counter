import {
  fetchFeed,
  feedCursorFor,
  fetchFriendTrainingStats,
  giveKudos,
  listFriends,
  removeKudos,
  WORKOUT_HISTORY_PAGE_SIZE,
  type FeedWorkoutEntry,
  type Friend,
  type TrainingStats,
  type WorkoutMediaRow,
} from "@counter/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { MediaViewer } from "../components/MediaViewer";
import { WorkoutCard } from "../components/WorkoutCard";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { useAuth } from "../lib/auth-context";
import { formatDuration, formatMonthYear, formatTotalVolume } from "../lib/format";
import { useMediaSigning } from "../lib/media-signing";
import { signAvatarUrl } from "../lib/media-urls";
import { supabase } from "../lib/supabase";

export function FriendProfilePage() {
  const { friendId = "" } = useParams();
  const { session } = useAuth();
  const userId = session!.user.id;
  const { signWorkouts, toMediaItems } = useMediaSigning();

  const [friend, setFriend] = useState<Friend | null>(null);
  const [notFriend, setNotFriend] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [workouts, setWorkouts] = useState<FeedWorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FeedWorkoutEntry | null>(null);
  const [viewer, setViewer] = useState<{
    media: WorkoutMediaRow[];
    index: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const friends = await listFriends(supabase);
      const match = friends.find((f) => f.id === friendId) ?? null;
      setFriend(match);
      if (!match) {
        setNotFriend(true);
        setLoading(false);
        return;
      }
      if (match.avatarPath) {
        void signAvatarUrl(match.avatarPath).then(setAvatarUrl).catch(() => {});
      }
      const [statsResult, page] = await Promise.all([
        fetchFriendTrainingStats(supabase, match.id),
        fetchFeed(supabase, userId, [match], null),
      ]);
      setStats(statsResult);
      setWorkouts(page);
      setReachedEnd(page.length < WORKOUT_HISTORY_PAGE_SIZE);
      void signWorkouts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta profilen.");
    }
    setLoading(false);
  }, [friendId, userId, signWorkouts]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadNextPage() {
    if (!friend || loadingMore || reachedEnd || loading) return;
    setLoadingMore(true);
    try {
      const next = await fetchFeed(
        supabase,
        userId,
        [friend],
        feedCursorFor(workouts),
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

  async function toggleKudos(entry: FeedWorkoutEntry) {
    const optimistic: FeedWorkoutEntry = {
      ...entry,
      kudosGivenByMe: !entry.kudosGivenByMe,
      kudosCount: entry.kudosCount + (entry.kudosGivenByMe ? -1 : 1),
    };
    const apply = (e: FeedWorkoutEntry) =>
      setWorkouts((prev) => prev.map((w) => (w.id === entry.id ? e : w)));
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

  if (notFriend) {
    return (
      <div className="page">
        <p className="status">
          Du är inte vän med den här personen. <Link to="/socialt">Till flödet</Link>
        </p>
      </div>
    );
  }

  const displayName = friend?.displayName ?? "Namnlös";

  return (
    <div className="page">
      <div className="page-header">
        <h1>{displayName}</h1>
        <Link className="link-button" to="/socialt">
          ← Tillbaka
        </Link>
      </div>

      {error && <p className="status error">{error}</p>}

      {loading ? (
        <p className="status">Laddar…</p>
      ) : (
        friend && (
          <>
            <section className="card">
              <div className="identity-row">
                <Avatar uri={avatarUrl} name={displayName} size={72} />
                <div>
                  <p className="identity-name">{displayName}</p>
                  {friend.friendsSince && (
                    <p className="text-muted">
                      Vän sedan {formatMonthYear(friend.friendsSince)}
                    </p>
                  )}
                </div>
              </div>
              {friend.homeGym && (
                <div className="detail-row">
                  <span className="text-muted">Hemgym</span>
                  <span>{friend.homeGym}</span>
                </div>
              )}
              {friend.bio && <p className="bio">{friend.bio}</p>}
            </section>

            <section className="card">
              <h2>Träning</h2>
              {stats ? (
                <div className="stat-grid">
                  <Stat label="Pass" value={String(stats.workoutCount)} />
                  <Stat
                    label="Total volym"
                    value={formatTotalVolume(stats.totalVolumeKg)}
                  />
                  <Stat
                    label="Total tid"
                    value={formatDuration(stats.totalMinutes)}
                  />
                </div>
              ) : (
                <p className="status">Laddar…</p>
              )}
            </section>

            <h2>Tidigare pass</h2>
            {workouts.length === 0 ? (
              <p className="status">Inga avslutade pass ännu.</p>
            ) : (
              <div className="card-list">
                {workouts.map((entry) => (
                  <WorkoutCard
                    key={entry.id}
                    entry={entry}
                    mediaItems={toMediaItems(entry.media)}
                    author={{ name: displayName, avatarUrl }}
                    kudos={{
                      givenByMe: entry.kudosGivenByMe,
                      onToggle: () => void toggleKudos(entry),
                    }}
                    onOpenDetail={() => setSelected(entry)}
                    onOpenMedia={(index) =>
                      setViewer({ media: entry.media, index })
                    }
                  />
                ))}
              </div>
            )}

            {!reachedEnd && workouts.length > 0 && (
              <button
                type="button"
                className="button-secondary load-more"
                onClick={() => void loadNextPage()}
                disabled={loadingMore}
              >
                {loadingMore ? "Laddar…" : "Ladda fler"}
              </button>
            )}
          </>
        )
      )}

      <WorkoutDetailModal
        entry={selected}
        mediaItems={selected ? toMediaItems(selected.media) : []}
        onClose={() => setSelected(null)}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
