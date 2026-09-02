import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, shadows } from "../lib/theme";
import {
  deleteTemplate,
  describeTemplate,
  loadTemplates,
  type WorkoutTemplate,
} from "../lib/workout-templates";

interface Props {
  userId: string;
  onOpenTemplate: (templateId: string) => void;
  onCreateTemplate: () => void;
  onClose: () => void;
}

export function TemplateListScreen({
  userId,
  onOpenTemplate,
  onCreateTemplate,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    loadTemplates(userId)
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  function confirmDelete(template: WorkoutTemplate) {
    Alert.alert(
      "Ta bort mallen?",
      `"${template.name}" tas bort. Det går inte att ångra.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: () => {
            deleteTemplate(userId, template.id)
              .then(() =>
                setTemplates((prev) =>
                  prev.filter((t) => t.id !== template.id),
                ),
              )
              .catch((err: unknown) =>
                Alert.alert(
                  "Kunde inte ta bort mallen",
                  err instanceof Error ? err.message : "Okänt fel.",
                ),
              );
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.title}>Mallar</Text>

      {loading ? (
        <ActivityIndicator />
      ) : templates.length === 0 ? (
        <Text style={styles.emptyText}>Du har inga mallar än.</Text>
      ) : (
        templates.map((template) => (
          <View key={template.id} style={styles.card}>
            <TouchableOpacity
              onPress={() => onOpenTemplate(template.id)}
              style={styles.cardMain}
            >
              <Text style={styles.cardTitle}>{template.name}</Text>
              <Text style={styles.cardSubtitle}>
                {describeTemplate(template)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(template)}>
              <Text style={styles.deleteText}>Ta bort</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={onCreateTemplate}>
        <Text style={styles.primaryButtonText}>Ny mall</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onClose}>
        <Text style={styles.linkText}>Tillbaka</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  emptyText: {
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 18,
    gap: 8,
    ...shadows.card,
  },
  cardMain: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  cardSubtitle: {
    color: colors.textMuted,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    ...shadows.accentButton,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  linkText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 8,
  },
});
