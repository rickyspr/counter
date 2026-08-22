import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { MediaItem } from "../lib/media-item";
import { signMediaUrls } from "../lib/media-urls";
import type { WorkoutHistoryEntry } from "../lib/queries";
import { MediaStrip } from "./MediaStrip";
import { MediaViewer } from "./MediaViewer";

interface Props {
  workout: WorkoutHistoryEntry | null;
  onClose: () => void;
  onEdit: (workoutId: string) => void;
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
export function WorkoutDetailModal({ workout, onClose, onEdit }: Props) {
  // Sökväg -> signerad URL. Bucketen är privat, så inget går att visa
  // förrän de hämtats.
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Signeras när ETT pass öppnas, inte för hela historiklistan. Ett
  // anrop för de media man faktiskt tittar på slår tjugo pass värt av
  // URL:er som ingen ser. Cachen i media-urls.ts gör att samma pass
  // öppnat två gånger bara kostar första gången.
  useEffect(() => {
    setViewerIndex(null);
    const paths = workout?.media.map((item) => item.storagePath) ?? [];
    if (paths.length === 0) {
      setUrls(new Map());
      return;
    }
    let cancelled = false;
    signMediaUrls(paths)
      .then((signed) => {
        if (!cancelled) setUrls(signed);
      })
      .catch(() => {
        // Rutorna blir kvar som tomma platshållare. Ingen dialog: det
        // här är inte något användaren matat in och inte något hen kan
        // åtgärda - och passets siffror är fortfarande läsbara.
      });
    return () => {
      cancelled = true;
    };
  }, [workout]);

  const mediaItems: MediaItem[] =
    workout?.media.map((item) => ({
      id: item.id,
      mediaType: item.mediaType,
      uri: urls.get(item.storagePath) ?? null,
      durationMs: item.durationMs,
      // Allt som ligger här kommer från servern, alltså är det uppe.
      pending: false,
    })) ?? [];

  return (
    <Modal
      visible={workout !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      {workout && (
        <View style={styles.container}>
          <View style={styles.header}>
            {/* Namnet är valfritt - utan det heter passet "Pass" och
                datumet under bär identiteten, precis som förut. */}
            <Text style={styles.title} numberOfLines={1}>
              {workout.name ?? "Pass"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Stäng</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.date}>{formatDateTime(workout.startedAt)}</Text>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => onEdit(workout.id)}
            >
              <Text style={styles.editButtonText}>Redigera pass</Text>
            </TouchableOpacity>

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

            {/* Utan onAdd/onRemove är remsan en ren visning. Att lägga
                till här hade dessutom betytt att ImagePickers egen
                modal öppnas inifrån den här - lägg till och ta bort hör
                hemma på redigeringsskärmen, som inte är en modal. */}
            {mediaItems.length > 0 && (
              <MediaStrip items={mediaItems} onOpen={setViewerIndex} />
            )}

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

          {/* Overlay, inte en Modal: den här komponenten ÄR redan en
              modal, och nästlade helskärmsmodaler är ostadiga på iOS. */}
          {viewerIndex !== null && viewerIndex < mediaItems.length && (
            <MediaViewer
              items={mediaItems}
              initialIndex={viewerIndex}
              onClose={() => setViewerIndex(null)}
            />
          )}
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
    flexShrink: 1,
  },
  editButton: {
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  editButtonText: {
    color: "#111827",
    fontWeight: "600",
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
