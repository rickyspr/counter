import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SyncStatusBanner } from "../components/SyncStatusBanner";
import { useSyncStatus } from "../lib/use-sync-status";
import {
  addExerciseToWorkout,
  addSet,
  deleteSet,
  endWorkout,
  fetchExerciseCatalog,
  removeExerciseFromWorkout,
  saveSet,
  type ExerciseOption,
} from "../lib/queries";

interface Props {
  workoutId: string;
  onFinish: () => void;
}

// reps/weightKg är det senast SPARADE värdet, repsDraft/weightDraft är
// det som just nu står i inmatningsfälten. Ett ogiltigt utkast kan då
// rullas tillbaka till det sparade värdet utan att något går förlorat.
interface LoggedSet {
  id: string;
  setNr: number;
  reps: number;
  weightKg: number;
  repsDraft: string;
  weightDraft: string;
}

interface Section {
  workoutExerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
}

interface SetInput {
  reps: string;
  weight: string;
}

// Number("") är 0, så tomma fält måste avvisas explicit. Komma
// accepteras som decimaltecken eftersom UI-språket är svenska.
function parseAmount(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

// reps är en int-kolumn i Postgres - ett decimaltal skulle avvisas av
// servern långt senare, när synk-kön spelas upp.
function parseReps(value: string): number | null {
  const parsed = parseAmount(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

function alertInvalidReps() {
  Alert.alert("Ogiltigt antal reps", "Ange reps som ett helt tal, t.ex. 8.");
}

function alertInvalidWeight() {
  Alert.alert("Ogiltig vikt", "Ange vikt i kg som ett tal, t.ex. 60.");
}

export function ActiveWorkoutScreen({ workoutId, onFinish }: Props) {
  const [catalog, setCatalog] = useState<ExerciseOption[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [inputs, setInputs] = useState<Record<string, SetInput>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const { online, pendingCount } = useSyncStatus();

  // Nästa lediga set_nr per övning, och nästa lediga order_index för
  // passet. Båda är monotona och återanvänds ALDRIG, inte ens efter en
  // borttagning: sets.length + 1 skulle krocka med ett kvarvarande
  // set_nr (unique (workout_exercise_id, set_nr)) och upserten i
  // synk-kön skulle då skriva över det setet i tysthet. Samma sak för
  // order_index mot unique (workout_id, order_index).
  //
  // De ligger i refs, inte i state, så att numret kan reserveras
  // synkront INNAN await:en nedan - annars kan två snabba tryck läsa
  // samma nummer och det andra setet skriva över det första.
  const nextSetNr = useRef<Record<string, number>>({});
  const nextOrderIndex = useRef(0);

  useEffect(() => {
    // Om detta misslyckas finns varken nät eller en sparad kopia av
    // övningskatalogen (se lib/queries.ts) - händer bara om appen
    // aldrig varit online sedan installation.
    fetchExerciseCatalog()
      .then(setCatalog)
      .catch(() =>
        Alert.alert(
          "Kunde inte hämta övningar",
          "Ingen uppkoppling och ingen sparad övningslista än. Öppna appen minst en gång med nät innan du loggar helt offline.",
        ),
      );
  }, []);

  // Skrivfunktionerna nedan går via en lokal synk-kö (se
  // lib/offline-queue.ts) - de väntar bara in det lokala sparandet
  // (millisekunder), inte nätverket, så hela passet går att logga
  // offline utan märkbar fördröjning.
  async function handlePickExercise(exercise: ExerciseOption) {
    setPickerOpen(false);
    const orderIndex = nextOrderIndex.current;
    nextOrderIndex.current += 1;
    try {
      const workoutExercise = await addExerciseToWorkout(
        workoutId,
        exercise.id,
        orderIndex,
      );
      nextSetNr.current[workoutExercise.id] = 1;
      setSections((prev) => [
        ...prev,
        {
          workoutExerciseId: workoutExercise.id,
          exerciseName: exercise.name,
          sets: [],
        },
      ]);
      setInputs((prev) => ({
        ...prev,
        [workoutExercise.id]: { reps: "", weight: "" },
      }));
    } catch (err) {
      Alert.alert(
        "Kunde inte lägga till övning",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function updateInput(
    workoutExerciseId: string,
    field: keyof SetInput,
    value: string,
  ) {
    setInputs((prev) => ({
      ...prev,
      [workoutExerciseId]: { ...prev[workoutExerciseId], [field]: value } as SetInput,
    }));
  }

  async function handleAddSet(section: Section) {
    const values = inputs[section.workoutExerciseId];
    const reps = parseReps(values?.reps ?? "");
    const weightKg = parseAmount(values?.weight ?? "");

    if (reps === null) {
      alertInvalidReps();
      return;
    }
    if (weightKg === null) {
      alertInvalidWeight();
      return;
    }

    // Reservera numret synkront, före await:en.
    const setNr = nextSetNr.current[section.workoutExerciseId] ?? 1;
    nextSetNr.current[section.workoutExerciseId] = setNr + 1;
    try {
      const { id } = await addSet(
        section.workoutExerciseId,
        setNr,
        reps,
        weightKg,
      );
      setSections((prev) =>
        prev.map((s) =>
          s.workoutExerciseId === section.workoutExerciseId
            ? {
                ...s,
                sets: [
                  ...s.sets,
                  {
                    id,
                    setNr,
                    reps,
                    weightKg,
                    repsDraft: String(reps),
                    weightDraft: String(weightKg),
                  },
                ],
              }
            : s,
        ),
      );
      setInputs((prev) => ({
        ...prev,
        [section.workoutExerciseId]: { reps: "", weight: "" },
      }));
    } catch (err) {
      Alert.alert(
        "Kunde inte spara set",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function updateSetDraft(
    workoutExerciseId: string,
    setId: string,
    field: "repsDraft" | "weightDraft",
    value: string,
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.workoutExerciseId === workoutExerciseId
          ? {
              ...section,
              sets: section.sets.map((s) =>
                s.id === setId ? { ...s, [field]: value } : s,
              ),
            }
          : section,
      ),
    );
  }

  function revertSetDraft(workoutExerciseId: string, setId: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.workoutExerciseId === workoutExerciseId
          ? {
              ...section,
              sets: section.sets.map((s) =>
                s.id === setId
                  ? {
                      ...s,
                      repsDraft: String(s.reps),
                      weightDraft: String(s.weightKg),
                    }
                  : s,
              ),
            }
          : section,
      ),
    );
  }

  // Körs när ett fält tappar fokus. Oförändrade värden sparas inte om.
  async function commitSetEdit(section: Section, set: LoggedSet) {
    const reps = parseReps(set.repsDraft);
    const weightKg = parseAmount(set.weightDraft);

    if (reps === null || weightKg === null) {
      revertSetDraft(section.workoutExerciseId, set.id);
      if (reps === null) alertInvalidReps();
      else alertInvalidWeight();
      return;
    }
    if (reps === set.reps && weightKg === set.weightKg) return;

    try {
      await saveSet(
        set.id,
        section.workoutExerciseId,
        set.setNr,
        reps,
        weightKg,
      );
      setSections((prev) =>
        prev.map((s) =>
          s.workoutExerciseId === section.workoutExerciseId
            ? {
                ...s,
                sets: s.sets.map((existing) =>
                  existing.id === set.id
                    ? {
                        ...existing,
                        reps,
                        weightKg,
                        repsDraft: String(reps),
                        weightDraft: String(weightKg),
                      }
                    : existing,
                ),
              }
            : s,
        ),
      );
    } catch (err) {
      revertSetDraft(section.workoutExerciseId, set.id);
      Alert.alert(
        "Kunde inte spara ändringen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function confirmDeleteSet(section: Section, set: LoggedSet, label: number) {
    Alert.alert(
      "Ta bort set?",
      `Set ${label} (${set.reps} reps × ${set.weightKg} kg) tas bort. Det går inte att ångra.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => void handleDeleteSet(section, set),
        },
      ],
    );
  }

  async function handleDeleteSet(section: Section, set: LoggedSet) {
    try {
      await deleteSet(set.id);
      // nextSetNr rörs inte - numret får aldrig återanvändas.
      setSections((prev) =>
        prev.map((s) =>
          s.workoutExerciseId === section.workoutExerciseId
            ? { ...s, sets: s.sets.filter((existing) => existing.id !== set.id) }
            : s,
        ),
      );
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort setet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function confirmRemoveExercise(section: Section) {
    const setCount = section.sets.length;
    Alert.alert(
      "Ta bort övning?",
      setCount === 0
        ? `${section.exerciseName} tas bort från passet.`
        : `${section.exerciseName} och dess ${setCount} set tas bort. Det går inte att ångra.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => void handleRemoveExercise(section),
        },
      ],
    );
  }

  async function handleRemoveExercise(section: Section) {
    try {
      await removeExerciseFromWorkout(section.workoutExerciseId);
      // nextOrderIndex och räknaren för övningen rörs inte - numren
      // får aldrig återanvändas.
      delete nextSetNr.current[section.workoutExerciseId];
      setSections((prev) =>
        prev.filter(
          (s) => s.workoutExerciseId !== section.workoutExerciseId,
        ),
      );
      setInputs((prev) => {
        const next = { ...prev };
        delete next[section.workoutExerciseId];
        return next;
      });
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort övningen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  async function handleFinish() {
    // Ett tryck på "Avsluta pass" triggar inte pålitligt onBlur på ett
    // fokuserat fält, så osparade ändringar måste fångas upp här.
    const writes: Promise<void>[] = [];
    let hasInvalidDraft = false;

    const committed = sections.map((section) => ({
      ...section,
      sets: section.sets.map((set) => {
        const reps = parseReps(set.repsDraft);
        const weightKg = parseAmount(set.weightDraft);
        if (reps === null || weightKg === null) {
          hasInvalidDraft = true;
          return set;
        }
        if (reps === set.reps && weightKg === set.weightKg) return set;
        writes.push(
          saveSet(set.id, section.workoutExerciseId, set.setNr, reps, weightKg),
        );
        return { ...set, reps, weightKg };
      }),
    }));

    if (hasInvalidDraft) {
      Alert.alert(
        "Rätta setet först",
        "Något set har ett ogiltigt värde för reps eller vikt.",
      );
      return;
    }

    try {
      await Promise.all(writes);
      setSections(committed);
      await endWorkout(workoutId);
      onFinish();
    } catch (err) {
      Alert.alert(
        "Kunde inte avsluta passet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Pågående pass</Text>

        {sections.map((section) => (
          <View key={section.workoutExerciseId} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.exerciseName}</Text>
              <TouchableOpacity onPress={() => confirmRemoveExercise(section)}>
                <Text style={styles.removeExerciseText}>Ta bort övning</Text>
              </TouchableOpacity>
            </View>

            {section.sets.length > 0 && (
              <View style={styles.setRow}>
                <Text style={[styles.setLabel, styles.columnHeader]} />
                <Text style={[styles.columnHeader, styles.columnHeaderCell]}>
                  Reps
                </Text>
                <Text style={[styles.columnHeader, styles.columnHeaderCell]}>
                  Kg
                </Text>
                <View style={styles.deleteButton} />
              </View>
            )}

            {/* Etiketten är radens position, inte set_nr - set_nr kan ha
                luckor efter en borttagning men användaren ska alltid se
                Set 1, 2, 3. Nyckeln måste vara id:t: med setNr eller
                index tappar fälten fokus och visar fel värde när ett
                set tas bort. */}
            {section.sets.map((s, index) => (
              <View key={s.id} style={styles.setRow}>
                <Text style={styles.setLabel}>Set {index + 1}</Text>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="numeric"
                  value={s.repsDraft}
                  onChangeText={(text) =>
                    updateSetDraft(
                      section.workoutExerciseId,
                      s.id,
                      "repsDraft",
                      text,
                    )
                  }
                  onBlur={() => void commitSetEdit(section, s)}
                />
                <TextInput
                  style={styles.smallInput}
                  keyboardType="numeric"
                  value={s.weightDraft}
                  onChangeText={(text) =>
                    updateSetDraft(
                      section.workoutExerciseId,
                      s.id,
                      "weightDraft",
                      text,
                    )
                  }
                  onBlur={() => void commitSetEdit(section, s)}
                />
                <TouchableOpacity
                  style={styles.deleteButton}
                  accessibilityLabel={`Ta bort set ${index + 1}`}
                  onPress={() => confirmDeleteSet(section, s, index + 1)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.setForm}>
              <TextInput
                style={styles.smallInput}
                placeholder="Reps"
                keyboardType="numeric"
                value={inputs[section.workoutExerciseId]?.reps ?? ""}
                onChangeText={(text) =>
                  updateInput(section.workoutExerciseId, "reps", text)
                }
              />
              <TextInput
                style={styles.smallInput}
                placeholder="Vikt (kg)"
                keyboardType="numeric"
                value={inputs[section.workoutExerciseId]?.weight ?? ""}
                onChangeText={(text) =>
                  updateInput(section.workoutExerciseId, "weight", text)
                }
              />
              <TouchableOpacity
                style={styles.smallButton}
                onPress={() => handleAddSet(section)}
              >
                <Text style={styles.smallButtonText}>Lägg till set</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.secondaryButtonText}>Lägg till övning</Text>
        </TouchableOpacity>
      </ScrollView>

      <SyncStatusBanner
        online={online}
        pendingCount={pendingCount}
        offlineLabel="Offline – loggas lokalt och synkas senare"
      />

      <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
        <Text style={styles.buttonText}>Avsluta pass</Text>
      </TouchableOpacity>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Välj övning</Text>
          <FlatList
            data={catalog}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.exerciseRow}
                onPress={() => handlePickExercise(item)}
              >
                <Text style={styles.exerciseName}>{item.name}</Text>
                {item.muscle_group && (
                  <Text style={styles.exerciseMuscle}>
                    {item.muscle_group}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={() => setPickerOpen(false)}>
            <Text style={styles.secondaryButtonText}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  scroll: {
    gap: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  section: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    flexShrink: 1,
  },
  removeExerciseText: {
    color: "#b91c1c",
    fontWeight: "600",
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  setLabel: {
    width: 52,
    color: "#374151",
  },
  columnHeader: {
    color: "#6b7280",
    fontSize: 12,
  },
  columnHeaderCell: {
    flex: 1,
  },
  deleteButton: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "#b91c1c",
    fontSize: 18,
    fontWeight: "600",
  },
  setForm: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  smallInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  smallButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  secondaryButton: {
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
  finishButton: {
    backgroundColor: "#b91c1c",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
});
