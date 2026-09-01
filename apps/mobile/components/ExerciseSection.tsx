import type { RefObject } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { weightInputValue } from "@counter/shared";
import type { PreviousSet } from "../lib/queries";
import type { LoggedSet } from "../lib/set-parsing";
import { colors, radii, shadows } from "../lib/theme";
import { useUnit } from "../lib/unit-context";

interface Props {
  title: string;
  sets: LoggedSet[];
  // Vad användaren körde på samma övning förra passet, i positions-
  // ordning. Visas som grå platshållare - inte som värden. Tom när det
  // inte är meningsfullt, t.ex. när man redigerar ett gammalt pass:
  // "förra gången" är då inte förra gången.
  previousSets: PreviousSet[];
  // Rader som en misslyckad validering pekat ut. Markeras röda.
  flaggedSetIds: string[];
  // Raden som just skapats och ska få markören.
  pendingFocusId: string | null;
  // Delas med skärmen, som behöver kunna fokusera en utpekad rad ur en
  // dialogknapp långt utanför den här komponenten.
  inputRefs: RefObject<Record<string, TextInput | null>>;
  onFocusHandled: () => void;
  onChangeDraft: (
    setId: string,
    field: "repsDraft" | "weightDraft",
    value: string,
  ) => void;
  onCommitSet: (set: LoggedSet) => void;
  // label är radens POSITION (1, 2, 3…), för dialogtexten.
  onDeleteSet: (set: LoggedSet, label: number) => void;
  onAddSet: () => void;
  onRemoveExercise: () => void;
}

// Ren presentation: en övning med sina set-rader. All state ligger kvar
// i skärmen som använder komponenten - både det pågående passet och
// redigeringen av ett avslutat pass renderar samma sak men äger sitt
// eget tillstånd och sina egna skrivningar.
export function ExerciseSection({
  title,
  sets,
  previousSets,
  flaggedSetIds,
  pendingFocusId,
  inputRefs,
  onFocusHandled,
  onChangeDraft,
  onCommitSet,
  onDeleteSet,
  onAddSet,
  onRemoveExercise,
}: Props) {
  const { unit } = useUnit();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={onRemoveExercise}>
          <Text style={styles.removeExerciseText}>Ta bort övning</Text>
        </TouchableOpacity>
      </View>

      {sets.length > 0 && (
        <View style={styles.setRow}>
          <Text style={styles.setLabel} />
          <Text style={[styles.columnHeader, styles.columnHeaderCell]}>
            {unit === "kg" ? "Kg" : "Lbs"}
          </Text>
          <Text style={[styles.columnHeader, styles.columnHeaderCell]}>
            Reps
          </Text>
          <View style={styles.deleteButton} />
        </View>
      )}

      {/* Etiketten är radens position, inte set_nr - set_nr kan ha
          luckor efter en borttagning men användaren ska alltid se
          Set 1, 2, 3. Nyckeln måste vara id:t: med setNr eller index
          tappar fälten fokus och visar fel värde när ett set tas bort.
          Platshållaren matchas på position av samma skäl. */}
      {sets.map((s, index) => {
        const previous = previousSets[index];
        const flagged = flaggedSetIds.includes(s.id);
        return (
          <View key={s.id} style={styles.setRow}>
            <Text style={styles.setLabel}>Set {index + 1}</Text>
            <TextInput
              ref={(el) => {
                inputRefs.current[s.id] = el;
              }}
              style={[styles.smallInput, flagged && styles.inputFlagged]}
              keyboardType="numeric"
              autoFocus={s.id === pendingFocusId}
              onFocus={onFocusHandled}
              placeholder={
                previous ? weightInputValue(previous.weightKg, unit) : ""
              }
              placeholderTextColor={colors.textFaint}
              value={s.weightDraft}
              onChangeText={(text) => onChangeDraft(s.id, "weightDraft", text)}
              onBlur={() => onCommitSet(s)}
            />
            <TextInput
              style={[styles.smallInput, flagged && styles.inputFlagged]}
              keyboardType="numeric"
              placeholder={previous ? String(previous.reps) : ""}
              placeholderTextColor={colors.textFaint}
              value={s.repsDraft}
              onChangeText={(text) => onChangeDraft(s.id, "repsDraft", text)}
              onBlur={() => onCommitSet(s)}
            />
            <TouchableOpacity
              style={styles.deleteButton}
              accessibilityLabel={`Ta bort set ${index + 1}`}
              onPress={() => onDeleteSet(s, index + 1)}
            >
              <Text style={styles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity style={styles.addSetButton} onPress={onAddSet}>
        <Text style={styles.addSetButtonText}>+ Lägg till set</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    gap: 8,
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    flexShrink: 1,
  },
  removeExerciseText: {
    color: colors.danger,
    fontWeight: "600",
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  setLabel: {
    width: 52,
    color: colors.inkSecondary,
  },
  columnHeader: {
    color: colors.textMuted,
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
    color: colors.danger,
    fontSize: 18,
    fontWeight: "600",
  },
  smallInput: {
    flex: 1,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputFlagged: {
    borderColor: colors.danger,
  },
  addSetButton: {
    borderWidth: 1,
    borderColor: colors.accentTint,
    borderStyle: "dashed",
    borderRadius: radii.sm,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  addSetButtonText: {
    color: colors.accentDeep,
    fontWeight: "600",
  },
});
