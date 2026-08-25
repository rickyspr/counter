import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MUSCLE_GROUPS } from "../lib/muscle-groups";
import type { ExerciseOption } from "../lib/queries";

interface Props {
  visible: boolean;
  catalog: ExerciseOption[];
  onPick: (exercise: ExerciseOption) => void;
  onClose: () => void;
  onCreate: (name: string, muscleGroup: string | null) => Promise<ExerciseOption>;
}

// Ren presentation plus det lilla "skapa övning"-formuläret, delad mellan
// ActiveWorkoutScreen och EditWorkoutScreen som annars hade behövt samma
// sök- och skapa-logik två gånger. Skärmarna äger fortfarande sitt eget
// handlePickExercise och catalog-state - komponenten bara rapporterar
// tillbaka via onPick/onCreate.
export function ExercisePicker({ visible, catalog, onPick, onClose, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [customGroupDraft, setCustomGroupDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Nollställ vid stängning, inte vid öppning - annars hinner FlatListen
  // rendera det gamla sökresultatet ett tick innan modalen syns.
  useEffect(() => {
    if (visible) return;
    setQuery("");
    setCreating(false);
    setNameDraft("");
    setSelectedGroup(null);
    setCustomGroupDraft("");
    setSubmitting(false);
  }, [visible]);

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? catalog.filter((e) => e.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : catalog;

  function openCreateForm(prefillName: string) {
    setNameDraft(prefillName);
    setSelectedGroup(null);
    setCustomGroupDraft("");
    setCreating(true);
  }

  async function handleSubmit() {
    const name = nameDraft.trim();
    if (!name) {
      Alert.alert("Namn saknas", "Skriv ett namn för övningen.");
      return;
    }
    const duplicate = catalog.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      Alert.alert(
        "Övningen finns redan",
        `"${duplicate.name}" finns redan i listan – välj den istället.`,
      );
      return;
    }
    const muscleGroup =
      selectedGroup === "annat" ? customGroupDraft.trim() || null : selectedGroup;
    setSubmitting(true);
    try {
      const created = await onCreate(name, muscleGroup);
      onPick(created);
    } catch (err) {
      Alert.alert(
        "Kunde inte spara övningen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {creating ? (
          <>
            <Text style={styles.title}>Lägg till egen övning</Text>
            <TextInput
              style={styles.input}
              placeholder="Namn"
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
            />
            <Text style={styles.label}>Muskelgrupp (valfritt)</Text>
            <View style={styles.chipRow}>
              {MUSCLE_GROUPS.map((group) => (
                <TouchableOpacity
                  key={group}
                  style={[styles.chip, selectedGroup === group && styles.chipSelected]}
                  onPress={() => setSelectedGroup(group)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedGroup === group && styles.chipTextSelected,
                    ]}
                  >
                    {group}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.chip, selectedGroup === "annat" && styles.chipSelected]}
                onPress={() => setSelectedGroup("annat")}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedGroup === "annat" && styles.chipTextSelected,
                  ]}
                >
                  annat
                </Text>
              </TouchableOpacity>
            </View>
            {selectedGroup === "annat" && (
              <TextInput
                style={styles.input}
                placeholder="T.ex. underarmar"
                value={customGroupDraft}
                onChangeText={setCustomGroupDraft}
              />
            )}

            <View style={styles.formButtonRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setCreating(false)}
              >
                <Text style={styles.secondaryButtonText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                onPress={() => void handleSubmit()}
                disabled={submitting}
              >
                <Text style={styles.primaryButtonText}>Spara</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Välj övning</Text>
            <TextInput
              style={styles.input}
              placeholder="Sök övning..."
              value={query}
              onChangeText={setQuery}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.exerciseRow} onPress={() => onPick(item)}>
                  <Text style={styles.exerciseName}>{item.name}</Text>
                  {item.muscle_group && (
                    <Text style={styles.exerciseMuscle}>{item.muscle_group}</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                trimmedQuery ? (
                  <Text style={styles.emptyText}>
                    Ingen övning matchade "{trimmedQuery}".
                  </Text>
                ) : null
              }
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.addRow}
                  onPress={() => openCreateForm(trimmedQuery)}
                >
                  <Text style={styles.addRowText}>
                    {trimmedQuery
                      ? `+ Lägg till "${trimmedQuery}" som ny övning`
                      : "+ Lägg till egen övning"}
                  </Text>
                </TouchableOpacity>
              }
            />
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Avbryt</Text>
            </TouchableOpacity>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  label: {
    color: "#6b7280",
    fontSize: 13,
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
  exerciseRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  exerciseName: {
    fontSize: 16,
  },
  exerciseMuscle: {
    color: "#6b7280",
  },
  emptyText: {
    color: "#6b7280",
    paddingVertical: 16,
  },
  addRow: {
    paddingVertical: 14,
  },
  addRowText: {
    color: "#111827",
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    color: "#111827",
  },
  chipTextSelected: {
    color: "#fff",
  },
  formButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
