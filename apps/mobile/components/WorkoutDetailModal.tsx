import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { WorkoutHistoryEntry } from "../lib/queries";

interface Props {
  workout: WorkoutHistoryEntry | null;
  onClose: () => void;
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

// Renderar enbart ur det som listan redan hämtat - passets set följer med
// i historikfrågan, så detaljvyn gör ingen egen nätverkstrafik.
//
// En Modal istället för en egen gren i App.tsx routern: vyn nås bara
// härifrån, och modalen ger stäng-beteendet gratis utan att den
// handrullade routern behöver en back-stack.
export function WorkoutDetailModal({ workout, onClose }: Props) {
  return (
    <Modal
      visible={workout !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      {workout && (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Pass</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Stäng</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.date}>{formatDateTime(workout.startedAt)}</Text>

            <View style={styles.summaryRow}>
              <Summary
                label="Volym"
                value={`${workout.summary.totalVolumeKg.toLocaleString("sv-SE")} kg`}
              />
              <Summary label="Set" value={String(workout.summary.setCount)} />
              <Summary
                label="Övningar"
                value={String(workout.summary.exerciseCount)}
              />
              <Summary
                label="Längd"
                value={
                  workout.summary.durationMinutes !== null
                    ? `${workout.summary.durationMinutes} min`
                    : "-"
                }
              />
            </View>

            {workout.exercises.length === 0 ? (
              <Text style={styles.emptyText}>Inga övningar i passet.</Text>
            ) : (
              workout.exercises.map((exercise) => (
                <View key={exercise.workoutExerciseId} style={styles.section}>
                  <Text style={styles.sectionTitle}>{exercise.name}</Text>
                  {exercise.sets.length === 0 ? (
                    <Text style={styles.emptyText}>Inga set.</Text>
                  ) : (
                    // Etiketten är radens POSITION, inte set_nr - numret
                    // kan ha luckor efter en borttagning, men användaren
                    // ska alltid se Set 1, 2, 3.
                    exercise.sets.map((set, index) => (
                      <View key={index} style={styles.setRow}>
                        <Text style={styles.setLabel}>Set {index + 1}</Text>
                        <Text style={styles.setValue}>
                          {set.weightKg.toLocaleString("sv-SE")} kg × {set.reps}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  closeText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 16,
  },
  scroll: {
    gap: 16,
    paddingBottom: 24,
  },
  date: {
    fontSize: 16,
    color: "#374151",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
  },
  summary: {
    minWidth: "40%",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  summaryLabel: {
    color: "#6b7280",
  },
  section: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 2,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  setLabel: {
    width: 60,
    color: "#6b7280",
  },
  setValue: {
    fontSize: 16,
  },
  emptyText: {
    color: "#6b7280",
  },
});
