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
import { FriendsModal } from "../components/FriendsModal";
import { MediaViewer } from "../components/MediaViewer";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { WorkoutMediaCarousel } from "../components/WorkoutMediaCarousel";
import { errorMessage } from "../lib/errors";
import {
  feedCursorFor,
  fetchFeed,
  giveKudos,
  removeKudos,
  type FeedWorkoutEntry,
} from "../lib/feed";
import { listFriends, listPendingRequests, type Friend } from "../lib/follows";
import type { MediaItem } from "../lib/media-item";
import { signAvatarUrl, signMediaUrls } from "../lib/media-urls";
import { WORKOUT_HISTORY_PAGE_SIZE } from "../lib/queries";
import { useSyncStatus } from "../lib/use-sync-status";

interface Props {
  userId: string;
}

// Samma layout som ProfileScreen: LIST_PADDING/CARD_BORDER driver
// kortbredden som skickas till WorkoutMediaCarousel, så karusellens
// sidsnäpp träffar kortets ram exakt.
const LIST_PADDING = 24;
const CARD_BORDER = 1;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Egen skärm, inte en delad komponent med ProfileScreen: den delar
// mönstret (FlatList med header, sidladdad historik, karusell + modal)
// men datat kommer från ett annat lager (feed.ts, flera användare) och
// varje kort har en författarrad + kudos-knapp som ProfileScreens
// historik inte har.
export function SocialScreen({ userId }: Props) {
  const { online } = useSyncStatus();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = windowWidth - LIST_PADDING * 2 - CARD_BORDER * 2;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [feed, setFeed] = useState<FeedWorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [selected, setSelected] = useState<FeedWorkoutEntry | null>(null);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [avatarUrls, setAvatarUrls] = useState<Map<string, string>>(new Map());
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(
    null,
  );

  const fetchingPage = useRef(false);

  async function signPage(entries: FeedWorkoutEntry[]) {
    const mediaPaths = entries.flatMap((w) => w.media.map((m) => m.storagePath));
    if (mediaPaths.length > 0) {
      try {
        const signed = await signMediaUrls(mediaPaths);
        setMediaUrls((prev) => {
          const next = new Map(prev);
          for (const [path, url] of signed) next.set(path, url);
          return next;
        });
      } catch {
        // Se ProfileScreen/WorkoutDetailModal - stödjande, aldrig ett
        // fel användaren ska se.
      }
    }

    const avatarPaths = [
      ...new Set(
        entries
          .map((w) => w.authorAvatarPath)
          .filter((p): p is string => p !== null),
      ),
    ];
    for (const path of avatarPaths) {
      if (avatarUrls.has(path)) continue;
      const url = await signAvatarUrl(path).catch(() => null);
      if (url) {
        setAvatarUrls((prev) => new Map(prev).set(path, url));
      }
    }
  }

  async function refreshIncomingCount() {
    try {
      const requests = await listPendingRequests();
      setIncomingCount(
        requests.filter((r) => r.direction === "incoming").length,
      );
    } catch {
      // Räknaren är en badge, inget kritiskt - en tyst miss lämnar den
      // bara oförändrad tills nästa lyckade hämtning.
    }
  }

  const loadFirstPage = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const friendList = await listFriends();
      setFriends(friendList);
      const firstPage = await fetchFeed(userId, friendList, null);
      setFeed(firstPage);
      setReachedEnd(firstPage.length < WORKOUT_HISTORY_PAGE_SIZE);
      void signPage(firstPage);
    } catch (err) {
      Alert.alert("Kunde inte hämta flödet", errorMessage(err));
    }
    void refreshIncomingCount();
    setLoading(false);
  }, [userId, online]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  async function loadNextPage() {
    if (fetchingPage.current || reachedEnd || loading || !online) return;
    fetchingPage.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchFeed(userId, friends, feedCursorFor(feed));
      setFeed((prev) => {
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
    // Optimistisk uppdatering, både i listan och i en öppen detaljvy -
    // en nätverksrundtrippa för en enkel gilla-markering hade känts
    // trögt. Misslyckas anropet rullas den tillbaka.
    const rollback = entry;
    const optimistic: FeedWorkoutEntry = {
      ...entry,
      kudosGivenByMe: !entry.kudosGivenByMe,
      kudosCount: entry.kudosCount + (entry.kudosGivenByMe ? -1 : 1),
    };
    setFeed((prev) => prev.map((w) => (w.id === entry.id ? optimistic : w)));
    setSelected((prev) => (prev?.id === entry.id ? optimistic : prev));

    try {
      if (entry.kudosGivenByMe) {
        await removeKudos(userId, entry.id);
      } else {
        await giveKudos(userId, entry.id);
      }
    } catch (err) {
      setFeed((prev) => prev.map((w) => (w.id === entry.id ? rollback : w)));
      setSelected((prev) => (prev?.id === entry.id ? rollback : prev));
      Alert.alert("Kunde inte uppdatera peppen", errorMessage(err));
    }
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Socialt</Text>
        <TouchableOpacity
          style={styles.friendsButton}
          onPress={() => setFriendsModalOpen(true)}
        >
          <Text style={styles.friendsButtonText}>Vänner</Text>
          {incomingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{incomingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const footer = !online ? (
    <Text style={styles.emptyText}>
      Ingen uppkoppling – flödet kräver nät.
    </Text>
  ) : loading ? (
    <ActivityIndicator style={styles.footerSpinner} />
  ) : friends.length === 0 ? (
    <Text style={styles.emptyText}>
      Inga vänner än. Tryck på Vänner för att hitta någon att följa.
    </Text>
  ) : feed.length === 0 ? (
    <Text style={styles.emptyText}>Inga pass från dina vänner än.</Text>
  ) : loadingMore ? (
    <ActivityIndicator style={styles.footerSpinner} />
  ) : null;

  return (
    <View style={styles.container}>
      <FlatList
        data={feed}
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
              avatarUrl={
                item.authorAvatarPath
                  ? avatarUrls.get(item.authorAvatarPath) ?? null
                  : null
              }
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

      <FriendsModal
        visible={friendsModalOpen}
        userId={userId}
        onClose={() => {
          setFriendsModalOpen(false);
          // Vänlistan kan ha ändrats (ny accepterad, en borttagen) medan
          // modalen var öppen - ladda om flödet och badgen istället för
          // att kräva ett manuellt drag-för-att-uppdatera.
          void loadFirstPage();
        }}
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

function FeedRow({
  item,
  mediaItems,
  avatarUrl,
  cardWidth,
  onPress,
  onOpenMedia,
  onToggleKudos,
}: {
  item: FeedWorkoutEntry;
  mediaItems: MediaItem[];
  avatarUrl: string | null;
  cardWidth: number;
  onPress: () => void;
  onOpenMedia: (index: number) => void;
  onToggleKudos: () => void;
}) {
  const authorName = item.authorDisplayName ?? "Okänd";
  return (
    <View style={styles.workoutCard}>
      <View style={styles.authorRow}>
        <Avatar uri={avatarUrl} name={authorName} size={32} />
        <Text style={styles.authorName} numberOfLines={1}>
          {authorName}
        </Text>
      </View>

      <WorkoutMediaCarousel items={mediaItems} width={cardWidth} onOpen={onOpenMedia} />

      <TouchableOpacity style={styles.workoutRow} onPress={onPress}>
        <View style={styles.workoutRowTop}>
          <Text style={styles.workoutDate} numberOfLines={1}>
            {item.name ?? formatDate(item.startedAt)}
          </Text>
          <Text style={styles.workoutVolume}>
            {item.summary.totalVolumeKg.toLocaleString("sv-SE")} kg
          </Text>
        </View>
        {item.name !== null && (
          <Text style={styles.workoutMeta}>{formatDate(item.startedAt)}</Text>
        )}
        {item.exercises.length > 0 && (
          <Text style={styles.workoutExercises} numberOfLines={1}>
            {[...new Set(item.exercises.map((e) => e.name))].join(", ")}
          </Text>
        )}
        <Text style={styles.workoutMeta}>
          {item.summary.setCount} set · {item.summary.exerciseCount}{" "}
          {item.summary.exerciseCount === 1 ? "övning" : "övningar"}
          {item.summary.durationMinutes !== null
            ? ` · ${item.summary.durationMinutes} min`
            : ""}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.kudosRow}
        onPress={onToggleKudos}
        accessibilityRole="button"
        accessibilityState={{ selected: item.kudosGivenByMe }}
      >
        <Text
          style={[
            styles.kudosText,
            item.kudosGivenByMe && styles.kudosTextActive,
          ]}
        >
          {item.kudosGivenByMe ? "★ Peppad" : "☆ Peppa"}
          {item.kudosCount > 0 ? ` (${item.kudosCount})` : ""}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: LIST_PADDING,
    // paddingTop overridden inline with insets.top + LIST_PADDING - see render.
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
    fontWeight: "700",
  },
  friendsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  friendsButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#b45309",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyText: {
    color: "#6b7280",
  },
  footerSpinner: {
    marginVertical: 16,
  },
  workoutCard: {
    borderWidth: CARD_BORDER,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    paddingBottom: 8,
  },
  authorName: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  workoutRow: {
    padding: 16,
    paddingTop: 12,
    gap: 4,
  },
  workoutRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  workoutDate: {
    fontSize: 16,
    fontWeight: "600",
  },
  workoutVolume: {
    fontSize: 16,
    fontWeight: "700",
  },
  workoutExercises: {
    color: "#374151",
  },
  workoutMeta: {
    color: "#6b7280",
    fontSize: 13,
  },
  kudosRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  kudosText: {
    color: "#374151",
    fontWeight: "600",
  },
  kudosTextActive: {
    color: "#b45309",
  },
});
