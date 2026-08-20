import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SyncStatusBanner } from "../components/SyncStatusBanner";
import { WorkoutDetailModal } from "../components/WorkoutDetailModal";
import {
  fetchProfile,
  fetchTrainingStats,
  updateDisplayName,
  type TrainingStats,
} from "../lib/profile";
import {
  fetchWorkoutHistory,
  WORKOUT_HISTORY_PAGE_SIZE,
  type WorkoutHistoryEntry,
} from "../lib/queries";
import { supabase } from "../lib/supabase";
import { useSyncStatus } from "../lib/use-sync-status";

interface Props {
  session: Session;
}

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

export function ProfileScreen({ session }: Props) {
  const userId = session.user.id;
  const { online, pendingCount } = useSyncStatus();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);

  const [workouts, setWorkouts] = useState<WorkoutHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [selected, setSelected] = useState<WorkoutHistoryEntry | null>(null);

  // Vakt mot att onEndReached avfyras flera gånger för samma sida medan
  // hämtningen pågår - FlatList kallar den gärna om vid varje scroll-tick.
  const fetchingPage = useRef(false);

  // Har användaren rört namnfältet? En omladdning (nätet vippar, eller
  // pull-to-refresh) får inte skriva över något man håller på att skriva.
  const nameDirty = useRef(false);
  // Senaste värdena, lästa av upprensningen vid unmount - den kör bara en
  // gång och skulle annars se värdena från första renderingen.
  const latestName = useRef({ draft: "", saved: null as string | null });
  latestName.current = { draft: nameDraft, saved: displayName };

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
    const [profile, trainingStats, firstPage] = await Promise.allSettled([
      fetchProfile(userId),
      fetchTrainingStats(),
      fetchWorkoutHistory(userId, 0),
    ]);

    if (profile.status === "fulfilled") {
      setDisplayName(profile.value.displayName);
      // Skriver inte över ett namn som håller på att redigeras.
      if (!nameDirty.current) setNameDraft(profile.value.displayName ?? "");
      setMemberSince(profile.value.createdAt ?? session.user.created_at);
    }
    if (trainingStats.status === "fulfilled") setStats(trainingStats.value);
    if (firstPage.status === "fulfilled") {
      setWorkouts(firstPage.value);
      setReachedEnd(firstPage.value.length < WORKOUT_HISTORY_PAGE_SIZE);
    }

    const failure = [profile, trainingStats, firstPage].find(
      (result) => result.status === "rejected",
    );
    if (failure?.status === "rejected") {
      Alert.alert(
        "Kunde inte hämta allt",
        failure.reason instanceof Error
          ? failure.reason.message
          : "Okänt fel.",
      );
    }
    setLoading(false);
  }, [userId, online, session.user.created_at]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  async function loadNextPage() {
    if (fetchingPage.current || reachedEnd || loading || !online) return;
    fetchingPage.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchWorkoutHistory(userId, workouts.length);
      // Filtrerar på id: skulle ett pass avslutas mellan två sidhämtningar
      // förskjuts offseten och samma rad kan komma tillbaka.
      setWorkouts((prev) => {
        const seen = new Set(prev.map((w) => w.id));
        return [...prev, ...next.filter((w) => !seen.has(w.id))];
      });
      if (next.length < WORKOUT_HISTORY_PAGE_SIZE) setReachedEnd(true);
    } catch (err) {
      Alert.alert(
        "Kunde inte hämta fler pass",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setLoadingMore(false);
      fetchingPage.current = false;
    }
  }

  // Sparar när fältet tappar fokus, samma mönster som set-raderna i
  // ActiveWorkoutScreen. Skriver bara när värdet faktiskt ändrats.
  async function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed === (displayName ?? "")) return;
    try {
      const saved = await updateDisplayName(userId, trimmed);
      nameDirty.current = false;
      setDisplayName(saved);
      setNameDraft(saved ?? "");
    } catch (err) {
      setNameDraft(displayName ?? "");
      nameDirty.current = false;
      Alert.alert(
        "Kunde inte spara namnet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  // onBlur räcker inte. Flikraden och "Logga ut" ligger UTANFÖR listan,
  // så ett tryck där lämnar fältet fokuserat, och React Native kallar
  // inte onBlur när en TextInput avmonteras - namnet man just skrivit
  // vore borta vid återkomsten. Samma fälla som handleFinish i
  // ActiveWorkoutScreen dokumenterar för set-fälten.
  useEffect(() => {
    return () => {
      const { draft, saved } = latestName.current;
      if (!nameDirty.current) return;
      if (draft.trim() === (saved ?? "")) return;
      // Skärmen försvinner - inget att visa ett fel på, och kön är inte
      // rätt plats för en profiländring. Bäst möjliga försök.
      void updateDisplayName(userId, draft).catch(() => {});
    };
  }, [userId]);

  // Google-inloggade får ett namn gratis i user_metadata; e-postkonton
  // har inget alls förrän man skriver in det.
  const fallbackName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    session.user.email ??
    "Namnlös";

  const header = (
    <View style={styles.headerContent}>
      <Text style={styles.title}>Profil</Text>

      <SyncStatusBanner online={online} pendingCount={pendingCount} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Visningsnamn</Text>
        <TextInput
          style={styles.input}
          value={nameDraft}
          onChangeText={(text) => {
            nameDirty.current = true;
            setNameDraft(text);
          }}
          onBlur={() => void commitName()}
          placeholder={fallbackName}
          placeholderTextColor="#9ca3af"
          autoCapitalize="words"
          returnKeyType="done"
        />
        <Text style={styles.metaText}>{session.user.email}</Text>
        {memberSince && (
          <Text style={styles.metaText}>
            Medlem sedan {formatMonthYear(memberSince)}
          </Text>
        )}
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
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={() => void loadNextPage()}
        onEndReachedThreshold={0.4}
        refreshing={loading}
        onRefresh={loadFirstPage}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.workoutRow}
            onPress={() => setSelected(item)}
          >
            <View style={styles.workoutRowTop}>
              <Text style={styles.workoutDate}>
                {formatDate(item.startedAt)}
              </Text>
              <Text style={styles.workoutVolume}>
                {item.summary.totalVolumeKg.toLocaleString("sv-SE")} kg
              </Text>
            </View>
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
          </TouchableOpacity>
        )}
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
      />
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
    padding: 24,
    paddingBottom: 8,
    gap: 12,
  },
  headerContent: {
    gap: 16,
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
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
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  metaText: {
    color: "#6b7280",
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
  workoutRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
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
