import { pickWorkoutPraise } from "@repcount/shared";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Celebration } from "../components/Celebration";
import { MediaStrip } from "../components/MediaStrip";
import { MediaViewer } from "../components/MediaViewer";
import type { MediaItem } from "../lib/media-item";
import type { FinishedWorkoutSummary } from "../lib/finished-workout";
import { colors, radii, shadows } from "../lib/theme";

interface Props {
  summary: FinishedWorkoutSummary;
  // Firandet + överblicken är klara: tillbaka till Hem.
  onDone: () => void;
  greetingName: string;
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Tusentalsavgränsare med blanksteg (sv-SE), skriven som worklet så den
// kan köras inuti useAnimatedProps.
function groupThousands(n: number): string {
  "worklet";
  const digits = String(Math.round(Math.abs(n)));
  let out = "";
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    out = digits[i] + out;
    count += 1;
    if (count % 3 === 0 && i > 0) out = " " + out;
  }
  return (n < 0 ? "-" : "") + out;
}

// Räknar upp från 0 till value när kortet dyker in. TextInput-tricket:
// texten sätts via animatedProps utan att komponenten renderas om.
function CountUp({
  value,
  suffix = "",
  delay,
  style,
}: {
  value: number;
  suffix?: string;
  delay: number;
  style: TextInputProps["style"];
}) {
  const n = useSharedValue(0);

  useEffect(() => {
    n.value = withDelay(
      delay,
      withTiming(value, { duration: 850, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, delay, n]);

  const animatedProps = useAnimatedProps(
    () =>
      // `text` finns inte i TextInputProps-typen men är det som gör
      // TextInput-uppräkningstricket möjligt.
      ({ text: `${groupThousands(n.value)}${suffix}` }) as unknown as TextInputProps,
  );

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      defaultValue={`0${suffix}`}
      style={style}
      animatedProps={animatedProps}
      pointerEvents="none"
    />
  );
}

function StatCard({
  label,
  value,
  suffix,
  staticValue,
  index,
}: {
  label: string;
  value?: number;
  suffix?: string;
  staticValue?: string;
  index: number;
}) {
  const delay = 140 + index * 90;
  return (
    <Animated.View
      style={styles.statCard}
      entering={FadeInDown.delay(delay).springify().damping(14).stiffness(160)}
    >
      {staticValue !== undefined ? (
        <Text style={styles.statValue}>{staticValue}</Text>
      ) : (
        <CountUp
          value={value ?? 0}
          suffix={suffix}
          delay={delay}
          style={styles.statValue}
        />
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} ${date.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

// Firandet spelar först och tonar över i den här överblicken, som sedan
// avtäcks sektion för sektion (Duolingo-vibe). Egen gren i App.tsx
// routern, precis som EditWorkoutScreen: flikraden ska vara dold.
export function WorkoutSummaryScreen({ summary, onDone, greetingName }: Props) {
  const insets = useSafeAreaInsets();
  const [celebrating, setCelebrating] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Deterministisk på passets sluttid (seedad i shared), så samma pass
  // alltid ger samma mening men två pass i rad ger olika.
  const praise = pickWorkoutPraise({
    name: greetingName,
    endedAt: summary.endedAt,
    beatPrevious: summary.beatPrevious,
  });

  const mediaItems: MediaItem[] = summary.media.map((item) => ({
    id: item.id,
    mediaType: item.mediaType,
    uri: item.localUri,
    durationMs: item.durationMs,
    pending: false,
  }));

  const { totalVolumeKg, setCount, exerciseCount, durationMinutes } =
    summary.summary;

  const exerciseBase = 140 + 4 * 90 + (summary.beatPrevious ? 90 : 0) + 60;

  return (
    <View style={styles.container}>
      {!celebrating && (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <Animated.View entering={FadeInDown.duration(380)}>
              <Text style={styles.eyebrow}>Passet är loggat</Text>
              <Text style={styles.title}>{summary.name}</Text>
              <Text style={styles.date}>{formatDateTime(summary.startedAt)}</Text>
            </Animated.View>

            <View style={styles.statGrid}>
              <StatCard
                label="Volym"
                value={totalVolumeKg}
                suffix=" kg"
                index={0}
              />
              <StatCard label="Set" value={setCount} index={1} />
              <StatCard label="Övningar" value={exerciseCount} index={2} />
              {durationMinutes !== null ? (
                <StatCard
                  label="Längd"
                  value={durationMinutes}
                  suffix=" min"
                  index={3}
                />
              ) : (
                <StatCard label="Längd" staticValue="–" index={3} />
              )}
            </View>

            {summary.beatPrevious && (
              <Animated.View
                style={styles.ribbon}
                entering={FadeInDown.delay(140 + 4 * 90)
                  .springify()
                  .damping(13)}
              >
                <Text style={styles.ribbonIcon}>★</Text>
                <Text style={styles.ribbonText}>
                  Nytt rekord – tyngre än förra passet
                </Text>
              </Animated.View>
            )}

            {mediaItems.length > 0 && (
              <Animated.View entering={FadeInDown.delay(exerciseBase - 30)}>
                <MediaStrip items={mediaItems} onOpen={setViewerIndex} />
              </Animated.View>
            )}

            {summary.exercises.map((exercise, i) => (
              <Animated.View
                key={i}
                style={styles.section}
                entering={FadeInDown.delay(exerciseBase + i * 55)}
              >
                <Text style={styles.sectionTitle}>{exercise.name}</Text>
                {exercise.sets.length === 0 ? (
                  <Text style={styles.emptyText}>Inga set.</Text>
                ) : (
                  <Text style={styles.setLine}>
                    {exercise.sets
                      .map((s) => `${s.weightKg.toLocaleString("sv-SE")}×${s.reps}`)
                      .join(", ")}
                  </Text>
                )}
              </Animated.View>
            ))}
          </ScrollView>

          <Animated.View
            entering={FadeInUp.delay(exerciseBase + summary.exercises.length * 55 + 40)}
          >
            <TouchableOpacity
              style={[styles.doneButton, { marginBottom: insets.bottom + 16 }]}
              onPress={onDone}
            >
              <Text style={styles.doneButtonText}>Klar</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {celebrating && (
        <Celebration
          praise={praise}
          beatPrevious={summary.beatPrevious}
          onDone={() => setCelebrating(false)}
        />
      )}

      {viewerIndex !== null && viewerIndex < mediaItems.length && (
        <MediaViewer
          items={mediaItems}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 12,
  },
  eyebrow: {
    color: colors.accentDeep,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: 2,
  },
  date: {
    fontSize: 16,
    color: colors.inkSecondary,
    marginTop: 4,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "46%",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 2,
    ...shadows.card,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
    padding: 0,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  ribbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.accentGhost,
    borderWidth: 1,
    borderColor: colors.accentTint,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  ribbonIcon: {
    fontSize: 18,
    color: colors.kudos,
  },
  ribbonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.accentDeep,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    gap: 4,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
  setLine: {
    fontSize: 15,
    color: colors.inkSecondary,
  },
  emptyText: {
    color: colors.textMuted,
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    marginHorizontal: 24,
    ...shadows.accentButton,
  },
  doneButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
});
