import { calculateAge } from "@repcount/shared";
import type { Session } from "@supabase/supabase-js";
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
import { SyncStatusBanner } from "../components/SyncStatusBanner";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import { WorkoutMediaCarousel } from "../components/WorkoutMediaCarousel";
import { MediaViewer } from "../components/MediaViewer";
import { errorMessage } from "../lib/errors";
import type { MediaItem } from "../lib/media-item";
import { signAvatarUrl, signMediaUrls } from "../lib/media-urls";
import {
  fallbackDisplayName,
  fetchProfile,
  fetchTrainingStats,
  type TrainingStats,
  type UserProfile,
} from "../lib/profile";
import {
  cursorFor,
  fetchWorkoutHistory,
  WORKOUT_HISTORY_PAGE_SIZE,
  type WorkoutHistoryEntry,
} from "../lib/queries";
import { supabase } from "../lib/supabase";
import { useSyncStatus } from "../lib/use-sync-status";

interface Props {
  session: Session;
  onEditWorkout: (workoutId: string) => void;
  onOpenSettings: () => void;
}

// Delade med stylesheeten längst ner (listContent.padding, workoutCard.
// borderWidth) - kortets bredd räknas ut ur samma tal som ritar det, så
// att karusellens sidsnäpp aldrig hamnar snett mot ramen.
const LIST_PADDING = 24;
const CARD_BORDER = 1;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    month: "long",
    year: "numeric",
  });
}

// Total tid blir snabbt hundratals minuter, vilket ingen läser som tid.
// Minuterna behålls: `Math.round(minuter / 60)` hade gjort ett enda
// 90-minuterspass till "2 h", och felet är som störst just när man har
// minst träning bakom sig.
function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// Livstidsvolym hamnar i tiotusentals kg. Ton är läsbart, kg är det inte.
function formatTotalVolume(kg: number): string {
  if (kg >= 10000) {
    return `${(kg / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ton`;
  }
  return `${Math.round(kg).toLocaleString("sv-SE")} kg`;
}

export function ProfileScreen({
  session,
  onEditWorkout,
  onOpenSettings,
}: Props) {
  const userId = session.user.id;
  const { online, pendingCount, pendingMediaCount } = useSyncStatus();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = windowWidth - LIST_PADDING * 2 - CARD_BORDER * 2;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);

  const [workouts, setWorkouts] = useState<WorkoutHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [selected, setSelected] = useState<WorkoutHistoryEntry | null>(null);
  // Sökväg -> signerad URL, för HELA historiklistan - till skillnad från
  // WorkoutDetailModal som bara signerar det ena passet man öppnat.
  // Historiklistan visar numera bilderna direkt, så alla synliga pass
  // behöver en URL, inte bara det man tittar på.
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(
    null,
  );

  // Signerar en sidas media i ETT anrop, inte per pass. Misslyckas det
  // visas bara tomma platshållare (se WorkoutMediaCarousel) - precis som
  // WorkoutDetailModal är det inte data användaren matat in och inte
  // något hen kan åtgärda.
  async function signPage(entries: WorkoutHistoryEntry[]) {
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
      // Se ovan - stödjande, aldrig ett fel användaren ska se.
    }
  }

  // Vakt mot att onEndReached avfyras flera gånger för samma sida medan
  // hämtningen pågår - FlatList kallar den gärna om vid varje scroll-tick.
  const fetchingPage = useRef(false);

  const loadFirstPage = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // allSettled, inte all: de tre hämtningarna är oberoende, och med
    // all() skulle ETT fel (t.ex. att statistik-migrationen inte är
    // pushad än, PGRST202) lämna hela sidan tom trots att både profil
    // och historik svarat. Varje del får misslyckas för sig.
    const [profileResult, trainingStats, firstPage] = await Promise.allSettled([
      fetchProfile(userId),
      fetchTrainingStats(),
      fetchWorkoutHistory(userId, null),
    ]);

    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value);
      const path = profileResult.value.avatarPath;
      // Signing is allowed to fail on its own: without a picture the
      // initials are shown, which beats an empty profile by a mile.
      setAvatarUrl(
        path === null ? null : await signAvatarUrl(path).catch(() => null),
      );
    }
    if (trainingStats.status === "fulfilled") setStats(trainingStats.value);
    if (firstPage.status === "fulfilled") {
      setWorkouts(firstPage.value);
      setReachedEnd(firstPage.value.length < WORKOUT_HISTORY_PAGE_SIZE);
      void signPage(firstPage.value);
    }

    const failure = [profileResult, trainingStats, firstPage].find(
      (result) => result.status === "rejected",
    );
    if (failure?.status === "rejected") {
      Alert.alert("Kunde inte hämta allt", errorMessage(failure.reason));
    }
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
      // Brytpunkten är sista raden vi har, inte antalet rader vi har -
      // se fetchWorkoutHistory. Med en offset hoppar listan över ett
      // pass så fort ett annat raderas eller flyttar sig i sorteringen
      // mitt under bläddringen, vilket båda numera går att göra.
      const next = await fetchWorkoutHistory(userId, cursorFor(workouts));
      // Dubblettskyddet står kvar ändå: ett pass vars starttid flyttas
      // NEDÅT i listan mellan två hämtningar kan hinna passera
      // brytpunkten och komma med en gång till.
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

  // Everything on this screen is read-only; changes are made in
  // ProfileSettingsScreen. That is why the name field, its blur-save
  // and the save-on-unmount rescue are gone - those problems existed
  // only while a TextInput here could be unmounted by the tab bar
  // mid-edit.
  const fallbackName = fallbackDisplayName(session);
  const memberSince = profile?.createdAt ?? session.user.created_at;
  const age = profile?.birthDate ? calculateAge(profile.birthDate) : null;

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Profil</Text>
        <TouchableOpacity onPress={onOpenSettings}>
          {/* Text, not a gear icon: no icon package is installed - see
              the comment in TabBar. */}
          <Text style={styles.editLink}>Redigera</Text>
        </TouchableOpacity>
      </View>

      <SyncStatusBanner
        online={online}
        pendingCount={pendingCount}
        pendingMediaCount={pendingMediaCount}
      />

      <View style={styles.card}>
        <View style={styles.identityRow}>
          <Avatar uri={avatarUrl} name={fallbackName} size={72} />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>
              {profile?.displayName ?? fallbackName}
            </Text>
            <Text style={styles.metaText}>{session.user.email}</Text>
            <Text style={styles.metaText}>
              Medlem sedan {formatMonthYear(memberSince)}
            </Text>
          </View>
        </View>

        {/* Empty fields are not rendered at all. A profile full of "Ej
            angivet" is a list of what the user has not done. */}
        {profile?.homeGym && <Detail label="Hemgym" value={profile.homeGym} />}
        {age !== null && <Detail label="Ålder" value={`${age} år`} />}
        {profile?.bodyWeightKg !== null &&
          profile?.bodyWeightKg !== undefined && (
            <Detail
              label="Vikt"
              value={`${profile.bodyWeightKg.toLocaleString("sv-SE")} kg`}
            />
          )}
        {profile?.heightCm !== null && profile?.heightCm !== undefined && (
          <Detail label="Längd" value={`${profile.heightCm} cm`} />
        )}
        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Din träning</Text>
        {!online ? (
          <Text style={styles.emptyText}>
            Ingen uppkoppling – statistik uppdateras när du är online igen.
          </Text>
        ) : loading ? (
          <ActivityIndicator />
        ) : stats ? (
          <View style={styles.statsGrid}>
            <Stat label="Pass" value={String(stats.workoutCount)} />
            <Stat
              label="Total volym"
              value={formatTotalVolume(stats.totalVolumeKg)}
            />
            <Stat
              label="Total tid"
              value={formatDuration(stats.totalMinutes)}
            />
          </View>
        ) : null}
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
      {/* FlatList som rot, med profilkorten som header - inte en
          ScrollView med en FlatList inuti, vilket skulle slå ut
          virtualiseringen och varna i konsolen. Listan kan bli lång. */}
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
            <WorkoutRow
              item={item}
              mediaItems={mediaItems}
              cardWidth={cardWidth}
              onPress={() => setSelected(item)}
              onOpenMedia={(index) => setViewer({ items: mediaItems, index })}
            />
          );
        }}
      />

      <TouchableOpacity
        style={styles.signOut}
        onPress={() => supabase.auth.signOut()}
      >
        <Text style={styles.signOutText}>Logga ut</Text>
      </TouchableOpacity>

      <WorkoutDetailModal
        workout={selected}
        onClose={() => setSelected(null)}
        // Detaljmodalen stängs innan redigeringen öppnas: den ligger
        // kvar över skärmen annars, och profilen renderas ändå om från
        // grunden när man kommer tillbaka.
        onEdit={(workoutId) => {
          setSelected(null);
          onEditWorkout(workoutId);
        }}
        kudosCount={selected?.kudosCount}
      />

      {/* Overlay ovanpå ALLT, inklusive "Logga ut" - samma mönster som
          i WorkoutDetailModal, som denna komponent är byggd för att
          kunna öppnas utanför. */}
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

function WorkoutRow({
  item,
  mediaItems,
  cardWidth,
  onPress,
  onOpenMedia,
}: {
  item: WorkoutHistoryEntry;
  mediaItems: MediaItem[];
  cardWidth: number;
  onPress: () => void;
  onOpenMedia: (index: number) => void;
}) {
  return (
    <View style={styles.workoutCard}>
      <WorkoutMediaCarousel items={mediaItems} width={cardWidth} onOpen={onOpenMedia} />
      <TouchableOpacity style={styles.workoutRow} onPress={onPress}>
        <View style={styles.workoutRowTop}>
          {/* Har passet ett namn bär det raden, med datumet under.
              Utan namn är datumet rubriken, precis som förut. */}
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
          // Dedupas: samma övning kan förekomma i två block i ett
          // pass, och "Bänkpress, Bänkpress · 1 övning" ser trasigt
          // ut. summary.exerciseCount räknar redan DISTINKTA
          // övningar, så det här matchar den siffran.
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
        {/* Bara när man faktiskt fått någon - annars visar varenda pass
            (särskilt alla från innan Socialt fanns) samma tomma rad. */}
        {item.kudosCount > 0 && (
          <Text style={styles.workoutMeta}>★ {item.kudosCount} peppa</Text>
        )}
      </TouchableOpacity>
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
    backgroundColor: "#fff",
  },
  // Utan flex:1 tar listan bara sin naturliga höjd bredvid "Logga ut"
  // och slutar scrolla.
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
    fontWeight: "700",
  },
  editLink: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  // Without flexShrink a long name or email address overflows the card
  // instead of wrapping.
  identityText: {
    flexShrink: 1,
    gap: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
  },
  metaText: {
    color: "#6b7280",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: {
    color: "#6b7280",
  },
  detailValue: {
    flexShrink: 1,
    fontWeight: "600",
    textAlign: "right",
  },
  bio: {
    color: "#374151",
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
    fontWeight: "700",
  },
  statLabel: {
    color: "#6b7280",
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  emptyText: {
    color: "#6b7280",
  },
  footerSpinner: {
    marginVertical: 16,
  },
  // Ramen och radien ligger här, inte på workoutRow: karusellen ska gå
  // kant i kant med kortets rundade hörn överst, och overflow:hidden är
  // det som klipper dess raka bild-hörn mot dem.
  workoutCard: {
    borderWidth: CARD_BORDER,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
  },
  workoutRow: {
    padding: 16,
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
  signOut: {
    paddingVertical: 12,
  },
  signOutText: {
    textAlign: "center",
    color: "#b91c1c",
  },
});
