import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  deleteSet,
  endWorkout,
  fetchExerciseCatalog,
  fetchPreviousSetsForExercise,
  newSetId,
  removeExerciseFromWorkout,
  saveSet,
  type ExerciseOption,
  type PreviousSet,
} from "../lib/queries";

interface Props {
  userId: string;
  workoutId: string;
  onFinish: () => void;
}

// En rad skapas av "Lägg till set" innan den fyllts i, så den finns
// bara i state tills BÅDA fälten är giltiga - då köas den. `saved` är
// hela skillnaden: null betyder att raden aldrig skrivits någonstans,
// annars är det senast sparade värdet. Att köa en 0×0-rad direkt vid
// knapptrycket hade gått igenom tabellens check-villkor och blivit
// skräp i statistiken om raden aldrig fylldes i.
interface LoggedSet {
  id: string;
  setNr: number;
  repsDraft: string;
  weightDraft: string;
  saved: { reps: number; weightKg: number } | null;
}

interface Section {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
  // Vad användaren körde på samma övning förra passet, i positions-
  // ordning. Visas som grå platshållare - inte som värden.
  previousSets: PreviousSet[];
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

function parseSetDrafts(
  set: LoggedSet,
): { reps: number; weightKg: number } | null {
  const reps = parseReps(set.repsDraft);
  const weightKg = parseAmount(set.weightDraft);
  if (reps === null || weightKg === null) return null;
  return { reps, weightKg };
}

export function ActiveWorkoutScreen({ userId, workoutId, onFinish }: Props) {
  const [catalog, setCatalog] = useState<ExerciseOption[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Raden som just skapats och ska få markören.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  // Rader som varningen vid avslut pekat ut. Markeras röda. Sätts först
  // vid avslut - en rad man håller på att fylla i ska inte lysa röd
  // medan man skriver.
  const [flaggedSetIds, setFlaggedSetIds] = useState<string[]>([]);
  const { online, pendingCount } = useSyncStatus();

  // Nästa lediga set_nr per övning, och nästa lediga order_index för
  // passet. Båda är monotona och återanvänds ALDRIG, inte ens efter en
  // borttagning: sets.length + 1 skulle krocka med ett kvarvarande
  // set_nr (unique (workout_exercise_id, set_nr)) och upserten i
  // synk-kön skulle då skriva över det setet i tysthet. Samma sak för
  // order_index mot unique (workout_id, order_index).
  //
  // De ligger i refs, inte i state, så att numret kan reserveras
  // synkront INNAN await:en - annars kan två snabba tryck läsa samma
  // nummer och det andra setet skriva över det första.
  const nextSetNr = useRef<Record<string, number>>({});
  const nextOrderIndex = useRef(0);
  const firstInputs = useRef<Record<string, TextInput | null>>({});

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

  // Skrivfunktionerna går via en lokal synk-kö (se lib/offline-queue.ts)
  // - de väntar bara in det lokala sparandet (millisekunder), inte
  // nätverket, så hela passet går att logga offline utan fördröjning.
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
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          sets: [],
          previousSets: [],
        },
      ]);

      // Skuggvärdena är rent stöd - de hämtas i bakgrunden och fyller på
      // sektionen när de kommer. Blir det inget svar syns bara inga
      // platshållare.
      void fetchPreviousSetsForExercise(userId, exercise.id)
        .then((previousSets) => {
          setSections((prev) =>
            prev.map((s) =>
              s.workoutExerciseId === workoutExercise.id
                ? { ...s, previousSets }
                : s,
            ),
          );
        })
        .catch(() => {});
    } catch (err) {
      Alert.alert(
        "Kunde inte lägga till övning",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function handleCreateSetRow(section: Section) {
    const last = section.sets[section.sets.length - 1];
    if (last && last.saved === null && parseSetDrafts(last) === null) {
      // Det finns redan en outfylld rad - flytta markören dit istället
      // för att stapla tomma rader ovanpå varandra.
      firstInputs.current[last.id]?.focus();
      return;
    }

    const setNr = nextSetNr.current[section.workoutExerciseId] ?? 1;
    nextSetNr.current[section.workoutExerciseId] = setNr + 1;
    const id = newSetId();

    setSections((prev) =>
      prev.map((s) =>
        s.workoutExerciseId === section.workoutExerciseId
          ? {
              ...s,
              sets: [
                ...s.sets,
                { id, setNr, repsDraft: "", weightDraft: "", saved: null },
              ],
            }
          : s,
      ),
    );
    setPendingFocusId(id);
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

  // Körs när ett fält tappar fokus. Ett tomt eller ogiltigt värde gör
  // ingenting alls - ingen dialog, ingen återställning. Man ska kunna
  // hoppa mellan reps och vikt utan att bli avbruten; allt som saknas
  // fångas istället av varningen vid "Avsluta pass".
  async function commitSetEdit(section: Section, set: LoggedSet) {
    const parsed = parseSetDrafts(set);
    if (parsed === null) return;
    if (
      set.saved &&
      parsed.reps === set.saved.reps &&
      parsed.weightKg === set.saved.weightKg
    ) {
      return;
    }

    try {
      await saveSet(
        set.id,
        section.workoutExerciseId,
        set.setNr,
        parsed.reps,
        parsed.weightKg,
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
                        saved: parsed,
                        repsDraft: String(parsed.reps),
                        weightDraft: String(parsed.weightKg),
                      }
                    : existing,
                ),
              }
            : s,
        ),
      );
      setFlaggedSetIds((prev) => prev.filter((id) => id !== set.id));
    } catch (err) {
      Alert.alert(
        "Kunde inte spara ändringen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function removeSetRow(section: Section, set: LoggedSet) {
    // nextSetNr rörs inte - numret får aldrig återanvändas.
    setSections((prev) =>
      prev.map((s) =>
        s.workoutExerciseId === section.workoutExerciseId
          ? { ...s, sets: s.sets.filter((existing) => existing.id !== set.id) }
          : s,
      ),
    );
    setFlaggedSetIds((prev) => prev.filter((id) => id !== set.id));
    delete firstInputs.current[set.id];
  }

  function confirmDeleteSet(section: Section, set: LoggedSet, label: number) {
    // En rad som aldrig sparats finns bara på skärmen - inget att
    // bekräfta och inget att ta bort på servern.
    if (set.saved === null) {
      removeSetRow(section, set);
      return;
    }

    Alert.alert(
      "Ta bort set?",
      `Set ${label} (${set.saved.reps} reps × ${set.saved.weightKg} kg) tas bort. Det går inte att ångra.`,
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
      removeSetRow(section, set);
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort setet",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  function confirmRemoveExercise(section: Section) {
    const savedCount = section.sets.filter((s) => s.saved !== null).length;
    Alert.alert(
      "Ta bort övning?",
      savedCount === 0
        ? `${section.exerciseName} tas bort från passet.`
        : `${section.exerciseName} och dess ${savedCount} set tas bort. Det går inte att ångra.`,
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
      // nextOrderIndex och räknaren för övningen rörs inte - numren får
      // aldrig återanvändas.
      delete nextSetNr.current[section.workoutExerciseId];
      const removedIds = new Set(section.sets.map((s) => s.id));
      for (const id of removedIds) delete firstInputs.current[id];
      setSections((prev) =>
        prev.filter((s) => s.workoutExerciseId !== section.workoutExerciseId),
      );
      setFlaggedSetIds((prev) => prev.filter((id) => !removedIds.has(id)));
    } catch (err) {
      Alert.alert(
        "Kunde inte ta bort övningen",
        err instanceof Error ? err.message : "Okänt fel.",
      );
    }
  }

  async function handleFinish() {
    // Ett tryck på "Avsluta pass" triggar inte pålitligt onBlur på ett
    // fokuserat fält, så drafts - inte `saved` - är källan här.
    //
    // Valideringen måste vara helt fri från sidoeffekter: skrevs ett
    // giltigt set redan under insamlingen skulle det hamna i kön även
    // när avslutet blockeras av ett ANNAT set. Raden hade då legat på
    // servern med saved === null lokalt, och ett efterföljande ✕ hade
    // tagit bort den bara från skärmen och lämnat kvar den i databasen.
    const problems: { setId: string | null; label: string }[] = [];
    const writes: {
      set: LoggedSet;
      section: Section;
      parsed: { reps: number; weightKg: number };
    }[] = [];

    const committed = sections.map((section) => {
      if (section.sets.length === 0) {
        problems.push({
          setId: null,
          label: `${section.exerciseName} – inga set`,
        });
        return section;
      }
      return {
        ...section,
        sets: section.sets.map((set, index) => {
          const parsed = parseSetDrafts(set);
          if (parsed === null) {
            problems.push({
              setId: set.id,
              label: `${section.exerciseName} – set ${index + 1}`,
            });
            return set;
          }
          if (
            set.saved &&
            parsed.reps === set.saved.reps &&
            parsed.weightKg === set.saved.weightKg
          ) {
            return set;
          }
          writes.push({ set, section, parsed });
          return {
            ...set,
            saved: parsed,
            repsDraft: String(parsed.reps),
            weightDraft: String(parsed.weightKg),
          };
        }),
      };
    });

    if (problems.length > 0) {
      const lines = problems.slice(0, 5).map((p) => `• ${p.label}`);
      if (problems.length > lines.length) {
        lines.push(`…och ${problems.length - lines.length} till`);
      }
      setFlaggedSetIds(
        problems.map((p) => p.setId).filter((id): id is string => id !== null),
      );
      const firstSetId = problems.find((p) => p.setId !== null)?.setId;
      Alert.alert(
        "Fyll i alla set",
        `Fyll i eller ta bort följande innan du avslutar:\n\n${lines.join("\n")}`,
        [
          {
            text: "OK",
            onPress: () => {
              if (firstSetId) firstInputs.current[firstSetId]?.focus();
            },
          },
        ],
      );
      return;
    }

    setFlaggedSetIds([]);
    try {
      await Promise.all(
        writes.map((w) =>
          saveSet(
            w.set.id,
            w.section.workoutExerciseId,
            w.set.setNr,
            w.parsed.reps,
            w.parsed.weightKg,
          ),
        ),
      );
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        // Utan detta går första trycket på ✕ eller "Lägg till set" åt
        // till att stänga tangentbordet istället för att träffa knappen.
        keyboardShouldPersistTaps="handled"
      >
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
                <Text style={styles.setLabel} />
                <Text style={[styles.columnHeader, styles.columnHeaderCell]}>
                  Kg
                </Text>
                <Text style={[styles.columnHeader, styles.columnHeaderCell]}>
                  Reps
                </Text>
                <View style={styles.deleteButton} />
              </View>
            )}

            {/* Etiketten är radens position, inte set_nr - set_nr kan ha
                luckor efter en borttagning men användaren ska alltid se
                Set 1, 2, 3. Nyckeln måste vara id:t: med setNr eller
                index tappar fälten fokus och visar fel värde när ett set
                tas bort. Platshållaren är förra passets motsvarande set,
                matchad på position av samma skäl. */}
            {section.sets.map((s, index) => {
              const previous = section.previousSets[index];
              const flagged = flaggedSetIds.includes(s.id);
              return (
                <View key={s.id} style={styles.setRow}>
                  <Text style={styles.setLabel}>Set {index + 1}</Text>
                  <TextInput
                    ref={(el) => {
                      firstInputs.current[s.id] = el;
                    }}
                    style={[styles.smallInput, flagged && styles.inputFlagged]}
                    keyboardType="numeric"
                    autoFocus={s.id === pendingFocusId}
                    onFocus={() => setPendingFocusId(null)}
                    placeholder={previous ? String(previous.weightKg) : ""}
                    placeholderTextColor="#9ca3af"
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
                  <TextInput
                    style={[styles.smallInput, flagged && styles.inputFlagged]}
                    keyboardType="numeric"
                    placeholder={previous ? String(previous.reps) : ""}
                    placeholderTextColor="#9ca3af"
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
                  <TouchableOpacity
                    style={styles.deleteButton}
                    accessibilityLabel={`Ta bort set ${index + 1}`}
                    onPress={() => confirmDeleteSet(section, s, index + 1)}
                  >
                    <Text style={styles.deleteButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.addSetButton}
              onPress={() => handleCreateSetRow(section)}
            >
              <Text style={styles.addSetButtonText}>+ Lägg till set</Text>
            </TouchableOpacity>
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
                  <Text style={styles.exerciseMuscle}>{item.muscle_group}</Text>
                )}
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={() => setPickerOpen(false)}>
            <Text style={styles.secondaryButtonText}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  smallInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputFlagged: {
    borderColor: "#b91c1c",
  },
  addSetButton: {
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  addSetButtonText: {
    color: "#374151",
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
