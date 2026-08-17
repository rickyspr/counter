import { useEffect, useState } from "react";
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
  endWorkout,
  fetchExerciseCatalog,
  type ExerciseOption,
} from "../lib/queries";

interface Props {
  workoutId: string;
  onFinish: () => void;
}

interface Section {
  workoutExerciseId: string;
  exerciseName: string;
  sets: { setNr: number; reps: number; weightKg: number }[];
}

interface SetInput {
  reps: string;
  weight: string;
}

export function ActiveWorkoutScreen({ workoutId, onFinish }: Props) {
  const [catalog, setCatalog] = useState<ExerciseOption[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [inputs, setInputs] = useState<Record<string, SetInput>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const { online, pendingCount } = useSyncStatus();

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

  // addExerciseToWorkout/addSet/endWorkout skriver via en lokal synk-kö
  // (se lib/offline-queue.ts) - de väntar bara in det lokala sparandet
  // (millisekunder), inte nätverket, så hela passet går att logga
  // offline utan märkbar fördröjning.
  async function handlePickExercise(exercise: ExerciseOption) {
    setPickerOpen(false);
    try {
      const workoutExercise = await addExerciseToWorkout(
        workoutId,
        exercise.id,
        sections.length,
      );
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
    const reps = Number(values?.reps);
    const weightKg = Number(values?.weight);

    if (!Number.isFinite(reps) || reps < 0) {
      Alert.alert("Ogiltigt antal reps", "Ange reps som ett tal, t.ex. 8.");
      return;
    }
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      Alert.alert("Ogiltig vikt", "Ange vikt i kg som ett tal, t.ex. 60.");
      return;
    }

    const setNr = section.sets.length + 1;
    try {
      await addSet(section.workoutExerciseId, setNr, reps, weightKg);
      setSections((prev) =>
        prev.map((s) =>
          s.workoutExerciseId === section.workoutExerciseId
            ? { ...s, sets: [...s.sets, { setNr, reps, weightKg }] }
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

  async function handleFinish() {
    try {
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
            <Text style={styles.sectionTitle}>{section.exerciseName}</Text>

            {section.sets.map((s) => (
              <Text key={s.setNr} style={styles.setRow}>
                Set {s.setNr}: {s.reps} reps × {s.weightKg} kg
              </Text>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  setRow: {
    color: "#374151",
  },
  setForm: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  smallInput: {
    flex: 1,
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
