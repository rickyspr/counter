import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { CARD_BORDER, FeedRow } from "../components/FeedRow";
import { MediaViewer } from "../components/MediaViewer";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { errorMessage } from "../lib/errors";
import {
  feedCursorFor,
  fetchFeed,
  giveKudos,
  removeKudos,
  type FeedWorkoutEntry,
} from "../lib/feed";
import type { Friend } from "../lib/follows";
import type { MediaItem } from "../lib/media-item";
import { signAvatarUrl, signMediaUrls } from "../lib/media-urls";
import { fetchFriendTrainingStats, type TrainingStats } from "../lib/profile";
import { WORKOUT_HISTORY_PAGE_SIZE } from "../lib/queries";
import { colors, radii, shadows } from "../lib/theme";
import { useSyncStatus } from "../lib/use-sync-status";

interface Props {
  friend: Friend;
  currentUserId: string;
  onClose: () => void;
}

// Samma tal som SocialScreen/ProfileScreen - kortbredden räknas ut ur
// samma padding/ram som ritar den, så karusellens sidsnäpp träffar rätt.
const LIST_PADDING = 24;

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    month: "long",
    year: "numeric",
  });
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function formatTotalVolume(kg: number): string {
  if (kg >= 10000) {
    return `${(kg / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ton`;
  }
  return `${Math.round(kg).toLocaleString("sv-SE")} kg`;
}

// Nästan ProfileScreen (identitetskort → statistikkort → sidladdad
// historik), men read-only och för en annan användare:
// - Ingen Session, ingen Redigera/inställningar/Logga ut - inget av det
//   beskriver NÅGONS ANNANS konto.
// - Historiken kommer från feed.ts, inte queries.ts: fetchFeed() med en
//   ensam vän i listan ger exakt samma rader (inklusive kudos) som
//   flödet redan visar för samma pass, med noll ny frågekod.
// - Ålder/vikt/längd visas aldrig - de exponeras inte för vänner någonstans
//   i schemat (se 20260826100400_social_profile_functions.sql), så det
//   finns inget att hämta ens om skärmen ville visa dem.
export function FriendProfileScreen({ friend, currentUserId, onClose }: Props) {
  const { online } = useSyncStatus();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = windowWidth - LIST_PADDING * 2 - CARD_BORDER * 2;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);

  const [workouts, setWorkouts] = useState<FeedWorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [selected, setSelected] = useState<FeedWorkoutEntry | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(
    null,
  );

  const fetchingPage = useRef(false);

  async function signPage(entries: FeedWorkoutEntry[]) {
    const paths = entries.flatMap((w) => w.media.map((m) => m.storagePath));
    if (paths.length === 0) return;
    try {
      const signed = await signMediaUrls(paths);
      setMediaUrls((prev) => {
        const next = new Map(prev);
        for (const [path, url] of signed) next.set(path, url);
        return next;
      });
    } catch {
      // Se ProfileScreen/WorkoutDetailModal - stödjande, aldrig ett fel
      // användaren ska se.
    }
  }

  const loadFirstPage = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const firstPage = await fetchFeed(currentUserId, [friend], null);
      setWorkouts(firstPage);
      setReachedEnd(firstPage.length < WORKOUT_HISTORY_PAGE_SIZE);
      void signPage(firstPage);
    } catch (err) {
      Alert.alert("Kunde inte hämta historiken", errorMessage(err));
    }
    setLoading(false);
  }, [currentUserId, friend, online]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    if (!friend.avatarPath) return;
    signAvatarUrl(friend.avatarPath)
      .then(setAvatarUrl)
      .catch(() => {
        // Ingen dialog - samma resonemang som all annan avatarsignering.
      });
  }, [friend.avatarPath]);

  useEffect(() => {
    if (!online) return;
    fetchFriendTrainingStats(friend.id)
      .then(setStats)
      .catch((err) => Alert.alert("Kunde inte hämta statistik", errorMessage(err)));
  }, [friend.id, online]);

  async function loadNextPage() {
    if (fetchingPage.current || reachedEnd || loading || !online) return;
    fetchingPage.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchFeed(currentUserId, [friend], feedCursorFor(workouts));
      setWorkouts((prev) => {
        const seen = new Set(prev.map((w) => w.id));
        return [...prev, ...next.filter((w) => !seen.has(w.id))];
      });
      void signPage(next);
      if (next.length < WORKOUT_HISTORY_PAGE_SIZE) setReachedEnd(true);
    } catch (err) {
      Alert.alert("Kunde inte hämta fler pass", errorMessage(err));
    } finally {
      setLoadingMore(false);
      fetchingPage.current = false;
    }
  }

  async function toggleKudos(entry: FeedWorkoutEntry) {
    const rollback = entry;
    const optimistic: FeedWorkoutEntry = {
      ...entry,
      kudosGivenByMe: !entry.kudosGivenByMe,
      kudosCount: entry.kudosCount + (entry.kudosGivenByMe ? -1 : 1),
    };
    setWorkouts((prev) => prev.map((w) => (w.id === entry.id ? optimistic : w)));
    setSelected((prev) => (prev?.id === entry.id ? optimistic : prev));

    try {
      if (entry.kudosGivenByMe) {
        await removeKudos(currentUserId, entry.id);
      } else {
        await giveKudos(currentUserId, entry.id);
      }
    } catch (err) {
      setWorkouts((prev) => prev.map((w) => (w.id === entry.id ? rollback : w)));
      setSelected((prev) => (prev?.id === entry.id ? rollback : prev));
      Alert.alert("Kunde inte uppdatera peppen", errorMessage(err));
    }
  }

  const displayName = friend.displayName ?? "Namnlös";

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {displayName}
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backLink}>← Tillbaka</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.identityRow}>
          <Avatar uri={avatarUrl} name={displayName} size={72} />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>
              {displayName}
            </Text>
            {friend.friendsSince && (
              <Text style={styles.metaText}>
                Vän sedan {formatMonthYear(friend.friendsSince)}
              </Text>
            )}
          </View>
        </View>

        {friend.homeGym && <Detail label="Hemgym" value={friend.homeGym} />}
        {friend.bio && <Text style={styles.bio}>{friend.bio}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Träning</Text>
        {!online ? (
          <Text style={styles.emptyText}>
            Ingen uppkoppling – statistik kräver nät.
          </Text>
        ) : stats ? (
          <View style={styles.statsGrid}>
            <Stat label="Pass" value={String(stats.workoutCount)} />
            <Stat
              label="Total volym"
              value={formatTotalVolume(stats.totalVolumeKg)}
            />
            <Stat label="Total tid" value={formatDuration(stats.totalMinutes)} />
          </View>
        ) : (
          <ActivityIndicator />
        )}
      </View>

      <Text style={styles.sectionHeading}>Tidigare pass</Text>
    </View>
  );

  const footer = !online ? (
    <Text style={styles.emptyText}>
      Ingen uppkoppling – historiken kräver nät.
    </Text>
  ) : loading ? (
    <ActivityIndicator style={styles.footerSpinner} />
  ) : workouts.length === 0 ? (
    <Text style={styles.emptyText}>Inga avslutade pass ännu.</Text>
  ) : loadingMore ? (
    <ActivityIndicator style={styles.footerSpinner} />
  ) : null;

  return (
    <View style={styles.container}>
      <FlatList
        data={workouts}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + LIST_PADDING }]}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={() => void loadNextPage()}
        onEndReachedThreshold={0.4}
        refreshing={loading}
        onRefresh={loadFirstPage}
        renderItem={({ item }) => {
          const mediaItems: MediaItem[] = item.media.map((m) => ({
            id: m.id,
            mediaType: m.mediaType,
            uri: mediaUrls.get(m.storagePath) ?? null,
            durationMs: m.durationMs,
            pending: false,
          }));
          return (
            <FeedRow
              item={item}
              mediaItems={mediaItems}
              avatarUrl={avatarUrl}
              cardWidth={cardWidth}
              onPress={() => setSelected(item)}
              onOpenMedia={(index) => setViewer({ items: mediaItems, index })}
              onToggleKudos={() => void toggleKudos(item)}
            />
          );
        }}
      />

      <WorkoutDetailModal
        workout={selected}
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
          items={viewer.items}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: LIST_PADDING,
    paddingBottom: 8,
    gap: 12,
  },
  headerContent: {
    gap: 16,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    flexShrink: 1,
  },
  backLink: {
    color: colors.accentDeep,
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    gap: 8,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  identityText: {
    flexShrink: 1,
    gap: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  metaText: {
    color: colors.textMuted,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: {
    color: colors.textMuted,
  },
  detailValue: {
    flexShrink: 1,
    fontWeight: "600",
    color: colors.inkSecondary,
    textAlign: "right",
  },
  bio: {
    color: colors.inkSecondary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  stat: {
    minWidth: "40%",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  statLabel: {
    color: colors.textMuted,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 4,
  },
  emptyText: {
    color: colors.textMuted,
  },
  footerSpinner: {
    marginVertical: 16,
  },
});
