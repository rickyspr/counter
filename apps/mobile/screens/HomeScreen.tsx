import {
  formatVolume,
  pickHomeGreeting,
  summarizeWorkout,
  type WorkoutSummary,
} from "@counter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, shadows } from "../lib/theme";
import { SyncStatusBanner } from "../components/SyncStatusBanner";
import { TemplatePicker } from "../components/TemplatePicker";
import {
  buildActiveWorkoutFromTemplate,
  loadTemplates,
  resolveTemplateExercises,
  type WorkoutTemplate,
} from "../lib/workout-templates";
import { useSyncStatus } from "../lib/use-sync-status";
import { useUnit } from "../lib/unit-context";
import {
  clearActiveWorkout,
  isExpired,
  loadActiveWorkout,
  saveActiveWorkout,
  type ActiveWorkout,
} from "../lib/active-workout";
import {
  addExerciseToWorkout,
  deleteWorkout,
  fetchExerciseCatalog,
  fetchLatestWorkoutSummaryInput,
  removeAllWorkoutMedia,
  startWorkout,
} from "../lib/queries";

interface Props {
  userId: string;
  // Förnamnet att tilltala med i hälsningen. Tomt = hälsa utan namn.
  greetingName: string;
  // Används för både ett nystartat och ett återupptaget pass.
  onOpenWorkout: (workoutId: string) => void;
  // Öppnar mall-listan (bygga/redigera/ta bort mallar).
  onManageTemplates: () => void;
}

export function HomeScreen({
  userId,
  greetingName,
  onOpenWorkout,
  onManageTemplates,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [kudosCount, setKudosCount] = useState<number | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const { online, pendingCount, pendingMediaCount } = useSyncStatus();
  const insets = useSafeAreaInsets();
  const { unit } = useUnit();

  // Vald en gång per öppning. Meningen är seedad i shared på dag + tid på
  // dygnet, så den är stabil hela dagen (pull-to-refresh byter den inte)
  // men blir en annan imorgon och skiljer morgon från kväll.
  const now = useRef(new Date()).current;
  const greeting = pickHomeGreeting({ name: greetingName, now });
  const greetingIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (reduceMotion) {
          greetingIn.setValue(1);
          return;
        }
        Animated.timing(greetingIn, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      })
      .catch(() => greetingIn.setValue(1));
  }, [greetingIn]);

  const loadLatestWorkout = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchLatestWorkoutSummaryInput(userId);
      setSummary(result ? summarizeWorkout(result.workout, result.sets) : null);
      setKudosCount(result ? result.kudosCount : null);
    } catch (err) {
      Alert.alert(
        "Kunde inte hämta senaste pass",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId, online]);

  // Läses lokalt, så kortet syns även utan uppkoppling.
  //
  // Ett för gammalt pass slutar ERBJUDAS, men raderas inte: bara den
  // lokala blobben släpps, serverraderna lämnas i fred. Den som loggat
  // ett riktigt pass och bara glömt trycka "Avsluta pass" ska inte få
  // sina set borttagna av en timer - och de syns ändå inte någonstans,
  // eftersom all statistik filtrerar på `ended_at is not null`. Att
  // radera på riktigt är alltid ett aktivt val ("Släng"/"Avbryt pass").
  const loadActive = useCallback(async () => {
    const stored = await loadActiveWorkout(userId);
    if (stored && isExpired(stored)) {
      await clearActiveWorkout();
      setActiveWorkout(null);
      return;
    }
    setActiveWorkout(stored);
  }, [userId]);

  // Mallar ligger lokalt (se lib/workout-templates.ts), så listan syns
  // även utan uppkoppling.
  const loadTemplateList = useCallback(async () => {
    setTemplates(await loadTemplates(userId));
  }, [userId]);

  useEffect(() => {
    loadLatestWorkout();
  }, [loadLatestWorkout]);

  useEffect(() => {
    loadActive().catch(() => {});
  }, [loadActive]);

  useEffect(() => {
    loadTemplateList().catch(() => {});
  }, [loadTemplateList]);

  useEffect(() => {
    // Värmer övningskatalog-cachen (se lib/queries.ts) medan vi
    // förhoppningsvis har nät, så den finns kvar om man startar ett
    // pass senare utan uppkoppling.
    fetchExerciseCatalog().catch(() => {});
  }, []);

  // startWorkout väntar bara in det lokala sparandet (millisekunder),
  // inte nätverket, så ett pass går att starta offline utan märkbar
  // fördröjning.
  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      const workout = await startWorkout(userId);
      // Blobben skrivs redan här, innan skärmen öppnas, så att passet
      // går att återuppta även om appen dör sekunden efter starten.
      // Det ger också ActiveWorkoutScreen en enda kodväg: den läser
      // alltid in ett sparat pass, nytt som återupptaget.
      await saveActiveWorkout({
        version: 1,
        userId,
        workoutId: workout.id,
        startedAt: workout.started_at,
        nextOrderIndex: 0,
        nextSetNr: {},
        sections: [],
      });
      onOpenWorkout(workout.id);
    } catch (err) {
      Alert.alert(
        "Kunde inte starta passet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setStarting(false);
    }
  }

  // Startar ett pass förifyllt från en mall. Ordningen är inte
  // förhandlingsbar:
  //  - Hela blobben måste nå disk INNAN övningarna köas, annars kan en
  //    add_exercise spelas upp mot ett workout som ännu inte finns
  //    (23503).
  //  - Köandet måste ske INNAN all persistens är klar bara på så sätt att
  //    räknarna redan är sparade: annars kan en krasch mellan enqueue och
  //    spar ge samma order_index två gånger (23505).
  //  - Räknarna först, sektionerna sist: dör appen i glappet är värsta
  //    fallet bara kosmetiskt (en sektion saknas i den återupptagna
  //    blobben, men raden ligger i kön).
  // Båda saveActiveWorkout måste awaitas - annars kan de slås ihop.
  async function handleStartFromTemplate(template: WorkoutTemplate) {
    if (starting) return;
    setStarting(true);
    setPickerOpen(false);
    try {
      const workout = await startWorkout(userId);
      const catalog = await fetchExerciseCatalog().catch(() => []);
      const { exercises, missing } = resolveTemplateExercises(template, catalog);

      if (exercises.length === 0) {
        Alert.alert(
          "Mallen går inte att starta",
          "Övningarna i mallen finns inte längre. Redigera mallen och lägg till övningar.",
        );
        return;
      }
      if (missing.length > 0) {
        // Inte inväntad - starten fortsätter med de övningar som finns.
        Alert.alert(
          "Vissa övningar saknas",
          `Följande övningar finns inte längre och hoppas över: ${missing.join(", ")}.`,
        );
      }

      const blob = buildActiveWorkoutFromTemplate({
        userId,
        workoutId: workout.id,
        startedAt: workout.started_at,
        name: template.name,
        exercises,
        unit,
      });

      // Räknarna på disk innan de förbrukas, sektionerna ännu inte.
      await saveActiveWorkout({ ...blob, sections: [] });
      for (const [orderIndex, section] of blob.sections.entries()) {
        await addExerciseToWorkout(
          workout.id,
          section.exerciseId,
          orderIndex,
          section.workoutExerciseId,
        );
      }
      // Nu skrivs sektionerna.
      await saveActiveWorkout(blob);
      onOpenWorkout(workout.id);
    } catch (err) {
      Alert.alert(
        "Kunde inte starta passet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function discardWorkout(session: ActiveWorkout) {
    await deleteWorkout(session.workoutId);
    // Passets rader städas av `on delete cascade`, men filerna i Storage
    // gör de inte - och en uppladdning som ännu inte körts måste
    // avbrytas, annars laddas en bild upp till ett pass som just
    // raderats.
    await removeAllWorkoutMedia(userId, session.media ?? []);
    await clearActiveWorkout();
  }

  function confirmDiscard(session: ActiveWorkout) {
    Alert.alert(
      "Släng passet?",
      "Passet och allt som loggats i det tas bort. Det går inte att ångra.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Släng",
          style: "destructive",
          onPress: () => {
            discardWorkout(session)
              .then(() => setActiveWorkout(null))
              .catch((err: unknown) =>
                Alert.alert(
                  "Kunde inte slänga passet",
                  err instanceof Error ? err.message : "Okänt fel.",
                ),
              );
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            loadLatestWorkout();
            loadActive().catch(() => {});
            loadTemplateList().catch(() => {});
          }}
        />
      }
    >
      <Animated.View
        style={{
          opacity: greetingIn,
          transform: [
            {
              translateY: greetingIn.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        }}
      >
        <Text style={styles.title}>{greeting.headline}</Text>
        <Text style={styles.subline}>{greeting.subline}</Text>
      </Animated.View>

      <SyncStatusBanner
        online={online}
        pendingCount={pendingCount}
        pendingMediaCount={pendingMediaCount}
      />

      {activeWorkout && (
        <View style={styles.activeCard}>
          <Text style={styles.cardTitle}>Pågående pass</Text>
          <Text style={styles.emptyText}>
            {describeActiveWorkout(activeWorkout)}
          </Text>
          <View style={styles.activeActions}>
            <TouchableOpacity
              style={[styles.button, styles.grow]}
              onPress={() => onOpenWorkout(activeWorkout.workoutId)}
            >
              <Text style={styles.buttonText}>Fortsätt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={() => confirmDiscard(activeWorkout)}
            >
              <Text style={styles.discardButtonText}>Släng</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Senaste pass</Text>
        {!online ? (
          <Text style={styles.emptyText}>
            Ingen uppkoppling – statistik uppdateras när du är online igen.
          </Text>
        ) : loading ? (
          <ActivityIndicator />
        ) : summary ? (
          <View style={styles.statsGrid}>
            <Stat
              label="Volym"
              value={formatVolume(summary.totalVolumeKg, unit)}
            />
            <Stat label="Set" value={String(summary.setCount)} />
            <Stat label="Övningar" value={String(summary.exerciseCount)} />
            <Stat
              label="Längd"
              value={
                summary.durationMinutes !== null
                  ? `${summary.durationMinutes} min`
                  : "-"
              }
            />
            <Stat label="Peppa" value={String(kudosCount ?? 0)} />
          </View>
        ) : (
          <Text style={styles.emptyText}>Inga avslutade pass ännu.</Text>
        )}
      </View>

      {/* Göms medan ett pass pågår. Det finns bara EN plats för ett
          pågående pass, så ett nytt pass skulle skriva över det gamla -
          som då varken går att återuppta eller slänga, eftersom kortet
          med "Släng" försvinner i samma veva. Vägen till ett nytt pass
          går via Fortsätt eller Släng. */}
      {!activeWorkout &&
        (templates.length === 0 ? (
          <View style={styles.startBlock}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleStart}
              disabled={starting}
            >
              <Text style={styles.buttonText}>Starta nytt pass</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onManageTemplates}>
              <Text style={styles.linkText}>Skapa en mall</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.startBlock}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleStart}
              disabled={starting}
            >
              <Text style={styles.buttonText}>Starta tomt pass</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setPickerOpen(true)}
              disabled={starting}
            >
              <Text style={styles.secondaryButtonText}>Starta från mall</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onManageTemplates}>
              <Text style={styles.linkText}>Hantera mallar</Text>
            </TouchableOpacity>
          </View>
        ))}

      <TemplatePicker
        visible={pickerOpen}
        templates={templates}
        onPick={(template) => void handleStartFromTemplate(template)}
        onClose={() => setPickerOpen(false)}
        onManage={() => {
          setPickerOpen(false);
          onManageTemplates();
        }}
      />
    </ScrollView>
  );
}

// "Startat 14:32 · 2 övningar · 5 set". Datum tas med först när passet
// inte startades idag - annars är klockslaget nog.
function describeActiveWorkout(session: ActiveWorkout): string {
  const started = new Date(session.startedAt);
  const time = started.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startedToday =
    started.toDateString() === new Date().toDateString();
  const when = startedToday
    ? `Startat ${time}`
    : `Startat ${started.toLocaleDateString("sv-SE")} ${time}`;

  const exerciseCount = session.sections.length;
  // Bara set som faktiskt skrivits räknas - en påbörjad rad är inte ett
  // loggat set.
  const setCount = session.sections.reduce(
    (total, section) =>
      total + section.sets.filter((s) => s.saved !== null).length,
    0,
  );

  return [
    when,
    `${exerciseCount} ${exerciseCount === 1 ? "övning" : "övningar"}`,
    `${setCount} set`,
  ].join(" · ");
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
    flexGrow: 1,
    padding: 24,
    gap: 16,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  subline: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 20,
    gap: 12,
    ...shadows.card,
  },
  activeCard: {
    backgroundColor: colors.accentGhost,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.accentTint,
    padding: 20,
    gap: 12,
    ...shadows.card,
  },
  activeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  grow: {
    flex: 1,
  },
  discardButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  discardButtonText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  emptyText: {
    color: colors.textMuted,
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
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadows.accentButton,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  startBlock: {
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    alignItems: "center",
    ...shadows.card,
  },
  secondaryButtonText: {
    color: colors.inkSecondary,
    fontWeight: "600",
  },
  linkText: {
    color: colors.accentDeep,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 4,
  },
});
