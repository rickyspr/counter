import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  describeTemplate,
  type WorkoutTemplate,
} from "../lib/workout-templates";
import { colors, radii, shadows } from "../lib/theme";

interface Props {
  visible: boolean;
  templates: WorkoutTemplate[];
  onPick: (template: WorkoutTemplate) => void;
  onClose: () => void;
  onManage: () => void;
}

// Liten väljare i samma anda som ExercisePicker, men utan sök och
// skapa-formulär: en mall väljs eller så går man vidare till att hantera
// dem.
export function TemplatePicker({
  visible,
  templates,
  onPick,
  onClose,
  onManage,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={styles.title}>Välj mall</Text>

        <FlatList
          data={templates}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => onPick(item)}
            >
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>{describeTemplate(item)}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Du har inga mallar än.</Text>
          }
        />

        <TouchableOpacity onPress={onManage}>
          <Text style={styles.manageText}>Hantera mallar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.cancelText}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    gap: 4,
    ...shadows.card,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  rowSubtitle: {
    color: colors.textMuted,
  },
  emptyText: {
    color: colors.textMuted,
    paddingVertical: 16,
  },
  manageText: {
    textAlign: "center",
    color: colors.accentDeep,
    fontWeight: "600",
    paddingVertical: 8,
  },
  cancelText: {
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: 8,
  },
});
