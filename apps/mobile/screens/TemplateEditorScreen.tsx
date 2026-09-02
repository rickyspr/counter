import {
  parseWeightInput,
  weightInputValue,
  WORKOUT_NAME_MAX_LENGTH,
} from "@counter/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExercisePicker } from "../components/ExercisePicker";
import { ExerciseSection } from "../components/ExerciseSection";
import { colors, radii, shadows } from "../lib/theme";
import {
  createCustomExercise,
  fetchExerciseCatalog,
  newSetId,
  type ExerciseOption,
  type PreviousSet,
} from "../lib/queries";
import { parseReps, type LoggedSet } from "../lib/set-parsing";
import { useUnit } from "../lib/unit-context";
import {
  defaultTemplateName,
  loadTemplates,
  newTemplateId,
  saveTemplate,
  type TemplateSet,
  type WorkoutTemplate,
} from "../lib/workout-templates";

interface Props {
  userId: string;
  templateId: string | null;
  onClose: () => void;
}

// Skärmens egen modell. Raderna modelleras som LoggedSet - `saved` är
// alltid null här - så ExerciseSection kan återanvändas helt oförändrad.
interface TemplateSection {
  localId: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
}

// Skuggvärden från "förra passet" hör inte hemma i en mall-editor.
// Modulnivå så att det inte blir en ny array per rendering (precedens i
// EditWorkoutScreen).
const NO_PREVIOUS_SETS: PreviousSet[] = [];

function serialize(name: string, sections: TemplateSection[]): string {
  return JSON.stringify({
    name: name.trim(),
    exercises: sections.map((s) => ({
      exerciseId: s.exerciseId,
      sets: s.sets.map((set) => ({
        reps: set.repsDraft.trim(),
        weight: set.weightDraft.trim(),
      })),
    })),
  });
}

function emptySet(): LoggedSet {
  return { id: newSetId(), setNr: 1, repsDraft: "", weightDraft: "", saved: null };
}

export function TemplateEditorScreen({ userId, templateId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { unit } = useUnit();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ExerciseOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [flaggedSetIds, setFlaggedSetIds] = useState<string[]>([]);

  // Alla mallar som fanns vid mount - för default-namnet och för att
  // bevara createdAt på en befintlig mall.
  const allTemplates = useRef<WorkoutTemplate[]>([]);
  const editing = useRef<WorkoutTemplate | null>(null);
  const initialSnapshot = useRef<string>("");
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const templates = await loadTemplates(userId);
      allTemplates.current = templates;

      let name = "";
      let initialSections: TemplateSection[] = [];
      if (templateId !== null) {
        const found = templates.find((t) => t.id === templateId) ?? null;
        if (found === null) {
          setLoadError("Mallen finns inte längre.");
          setLoading(false);
          return;
        }
        editing.current = found;
        name = found.name;
        initialSections = found.exercises.map((exercise) => ({
          localId: newSetId(),
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          sets: exercise.sets.map((set, index) => ({
            id: newSetId(),
            setNr: index + 1,
            repsDraft: set.reps === null ? "" : String(set.reps),
            weightDraft:
              set.weightKg === null
                ? ""
                : weightInputValue(set.weightKg, unit),
            saved: null,
          })),
        }));
      }

      setNameDraft(name);
      setSections(initialSections);
      initialSnapshot.current = serialize(name, initialSections);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Okänt fel.");
    } finally {
      setLoading(false);
    }
  }, [userId, templateId, unit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchExerciseCatalog()
      .then(setCatalog)
      .catch(() => {});
  }, []);

  function handlePickExercise(exercise: ExerciseOption) {
    setPickerOpen(false);
    setSections((prev) => [
      ...prev,
      {
        localId: newSetId(),
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: [emptySet()],
      },
    ]);
  }

  function handleCreateSetRow(section: TemplateSection) {
    const id = newSetId();
    setSections((prev) =>
      prev.map((s) =>
        s.localId === section.localId
          ? {
              ...s,
              sets: [
                ...s.sets,
                {
                  id,
                  setNr: s.sets.length + 1,
                  repsDraft: "",
                  weightDraft: "",
                  saved: null,
                },
              ],
            }
          : s,
      ),
    );
    setPendingFocusId(id);
  }

  function updateSetDraft(
    localId: string,
    setId: string,
    field: "repsDraft" | "weightDraft",
    value: string,
  ) {
    setSections((prev) =>
      prev.map((section) =>
        section.localId === localId
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

  function removeSetRow(section: TemplateSection, set: LoggedSet) {
    setSections((prev) =>
      prev.map((s) =>
        s.localId === section.localId
          ? { ...s, sets: s.sets.filter((existing) => existing.id !== set.id) }
          : s,
      ),
    );
    setFlaggedSetIds((prev) => prev.filter((id) => id !== set.id));
    delete inputRefs.current[set.id];
  }

  function confirmRemoveExercise(section: TemplateSection) {
    Alert.alert("Ta bort övning?", `${section.exerciseName} tas bort ur mallen.`, [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Ta bort",
        style: "destructive",
        onPress: () => {
          const removedIds = new Set(section.sets.map((s) => s.id));
          for (const id of removedIds) delete inputRefs.current[id];
          setSections((prev) =>
            prev.filter((s) => s.localId !== section.localId),
          );
          setFlaggedSetIds((prev) =>
            prev.filter((id) => !removedIds.has(id)),
          );
        },
      },
    ]);
  }

  function handleSave() {
    const problems: { setId: string; label: string }[] = [];
    const builtSections: { section: TemplateSection; sets: TemplateSet[] }[] = [];

    for (const section of sections) {
      const built: TemplateSet[] = [];
      section.sets.forEach((set, index) => {
        const repsText = set.repsDraft.trim();
        const weightText = set.weightDraft.trim();
        const reps = repsText === "" ? null : parseReps(repsText);
        const weightKg =
          weightText === "" ? null : parseWeightInput(weightText, unit);
        if (
          (repsText !== "" && reps === null) ||
          (weightText !== "" && weightKg === null)
        ) {
          problems.push({
            setId: set.id,
            label: `${section.exerciseName} – set ${index + 1}`,
          });
          return;
        }
        built.push({ reps, weightKg });
      });
      // En övning utan en enda rad släpps tyst.
      if (built.length > 0) {
        builtSections.push({ section, sets: built });
      }
    }

    if (problems.length > 0) {
      const lines = problems.slice(0, 5).map((p) => `• ${p.label}`);
      if (problems.length > lines.length) {
        lines.push(`…och ${problems.length - lines.length} till`);
      }
      setFlaggedSetIds(problems.map((p) => p.setId));
      const firstSetId = problems[0]?.setId;
      Alert.alert(
        "Fyll i eller ta bort",
        `Följande set går inte att tolka:\n\n${lines.join("\n")}`,
        [
          {
            text: "OK",
            onPress: () => {
              if (firstSetId) inputRefs.current[firstSetId]?.focus();
            },
          },
        ],
      );
      return;
    }

    if (builtSections.length === 0) {
      Alert.alert("Mallen är tom", "Lägg till minst en övning innan du sparar.");
      return;
    }

    setFlaggedSetIds([]);

    const existing = editing.current;
    const now = new Date().toISOString();
    const name =
      nameDraft.trim() || defaultTemplateName(allTemplates.current);
    const template: WorkoutTemplate = {
      version: 1,
      id: existing?.id ?? newTemplateId(),
      name,
      exercises: builtSections.map(({ section, sets }) => ({
        exerciseId: section.exerciseId,
        exerciseName: section.exerciseName,
        sets,
      })),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    saveTemplate(userId, template)
      .then(() => onClose())
      .catch((err: unknown) =>
        Alert.alert(
          "Kunde inte spara mallen",
          err instanceof Error ? err.message : "Okänt fel.",
        ),
      );
  }

  function handleCancel() {
    if (serialize(nameDraft, sections) === initialSnapshot.current) {
      onClose();
      return;
    }
    Alert.alert("Kassera ändringarna?", "Det du har ändrat sparas inte.", [
      { text: "Fortsätt redigera", style: "cancel" },
      { text: "Kassera", style: "destructive", onPress: onClose },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError !== null) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { paddingTop: insets.top + 24 },
        ]}
      >
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.linkText}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          {templateId === null ? "Ny mall" : "Redigera mall"}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Namn</Text>
          <TextInput
            style={styles.input}
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder={
              templateId === null
                ? defaultTemplateName(allTemplates.current)
                : undefined
            }
            placeholderTextColor={colors.textFaint}
            maxLength={WORKOUT_NAME_MAX_LENGTH}
            autoCapitalize="sentences"
            returnKeyType="done"
          />
        </View>

        {sections.map((section) => (
          <ExerciseSection
            key={section.localId}
            title={section.exerciseName}
            sets={section.sets}
            previousSets={NO_PREVIOUS_SETS}
            flaggedSetIds={flaggedSetIds}
            pendingFocusId={pendingFocusId}
            inputRefs={inputRefs}
            onFocusHandled={() => setPendingFocusId(null)}
            onChangeDraft={(setId, field, value) =>
              updateSetDraft(section.localId, setId, field, value)
            }
            // Mallens rader skrivs bara på "Spara", inte vid blur.
            onCommitSet={() => {}}
            onDeleteSet={(s) => removeSetRow(section, s)}
            onAddSet={() => handleCreateSetRow(section)}
            onRemoveExercise={() => confirmRemoveExercise(section)}
          />
        ))}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.secondaryButtonText}>Lägg till övning</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.doneButton} onPress={handleSave}>
        <Text style={styles.doneButtonText}>Spara</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleCancel}>
        <Text style={styles.linkText}>Avbryt</Text>
      </TouchableOpacity>

      <ExercisePicker
        visible={pickerOpen}
        catalog={catalog}
        onPick={handlePickExercise}
        onClose={() => setPickerOpen(false)}
        onCreate={async (name, muscleGroup) => {
          const exercise = await createCustomExercise(userId, name, muscleGroup);
          setCatalog((prev) => [
            ...prev.filter((e) => e.name !== exercise.name),
            exercise,
          ]);
          return exercise;
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    gap: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    gap: 12,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
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
  errorText: {
    color: colors.danger,
    textAlign: "center",
  },
  linkText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 8,
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadows.accentButton,
  },
  doneButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
});
