import { summarizeWorkout, type WorkoutSummary } from "@repcount/shared";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { fetchLatestWorkoutSummaryInput, startWorkout } from "../lib/queries";
import { supabase } from "../lib/supabase";

interface Props {
  userId: string;
  onStartWorkout: (workoutId: string) => void;
}

export function HomeScreen({ userId, onStartWorkout }: Props) {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);

  const loadLatestWorkout = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLatestWorkoutSummaryInput(userId);
      setSummary(result ? summarizeWorkout(result.workout, result.sets) : null);
    } catch (err) {
      Alert.alert(
        "Kunde inte hämta senaste pass",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadLatestWorkout();
  }, [loadLatestWorkout]);

  async function handleStart() {
    setStarting(true);
    try {
      const workout = await startWorkout(userId);
      onStartWorkout(workout.id);
    } catch (err) {
      Alert.alert(
        "Kunde inte starta pass",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadLatestWorkout} />
      }
    >
      <Text style={styles.title}>RepCount</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Senaste pass</Text>
        {loading ? (
          <ActivityIndicator />
        ) : summary ? (
          <View style={styles.statsGrid}>
            <Stat label="Volym" value={`${summary.totalVolumeKg} kg`} />
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
          </View>
        ) : (
          <Text style={styles.emptyText}>Inga avslutade pass ännu.</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleStart}
        disabled={starting}
      >
        {starting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Starta nytt pass</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Logga ut</Text>
      </TouchableOpacity>
    </ScrollView>
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
    flexGrow: 1,
    padding: 24,
    gap: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptyText: {
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
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  signOutText: {
    textAlign: "center",
    color: "#b91c1c",
  },
});
