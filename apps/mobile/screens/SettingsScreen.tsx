import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Unit } from "@counter/shared";
import { errorMessage } from "../lib/errors";
import {
  DEFAULT_REST_TIMER,
  REST_TIMER_PRESETS,
  loadRestTimerSettings,
  parseRestSeconds,
  saveRestTimerSettings,
  type RestTimerSettings,
} from "../lib/rest-timer";
import { colors, radii, shadows } from "../lib/theme";
import { useUnit } from "../lib/unit-context";

interface Props {
  onClose: () => void;
}

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "kg", label: "Kilogram (kg)" },
  { value: "lbs", label: "Pound (lbs)" },
];

export function SettingsScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { unit, setUnit } = useUnit();
  const [changingUnit, setChangingUnit] = useState(false);

  const [restTimer, setRestTimer] =
    useState<RestTimerSettings>(DEFAULT_REST_TIMER);
  // Fritt-textfältet för egen tid. Speglar restTimer.seconds tills
  // användaren skriver något ogiltigt - då står fältet kvar rött och
  // inget sparas.
  const [customDraft, setCustomDraft] = useState(
    String(DEFAULT_REST_TIMER.seconds),
  );
  const [customInvalid, setCustomInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRestTimerSettings().then((loaded) => {
      if (cancelled) return;
      setRestTimer(loaded);
      setCustomDraft(String(loaded.seconds));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePickUnit(next: Unit) {
    if (next === unit || changingUnit) return;
    setChangingUnit(true);
    try {
      await setUnit(next);
    } catch (err) {
      Alert.alert("Kunde inte byta enhet", errorMessage(err));
    } finally {
      setChangingUnit(false);
    }
  }

  function persistRestTimer(next: RestTimerSettings) {
    setRestTimer(next);
    void saveRestTimerSettings(next);
  }

  function handleToggleRestTimer(enabled: boolean) {
    persistRestTimer({ ...restTimer, enabled });
  }

  function handlePickPreset(seconds: number) {
    setCustomDraft(String(seconds));
    setCustomInvalid(false);
    persistRestTimer({ ...restTimer, seconds });
  }

  function handleCustomChange(text: string) {
    setCustomDraft(text);
    const parsed = parseRestSeconds(text);
    if (parsed === null) {
      setCustomInvalid(true);
      return;
    }
    setCustomInvalid(false);
    persistRestTimer({ ...restTimer, seconds: parsed });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.title}>Inställningar</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Enhet</Text>
        <View style={styles.chipRow}>
          {UNIT_OPTIONS.map((option) => {
            const active = option.value === unit;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, active && styles.chipActive]}
                disabled={changingUnit}
                onPress={() => void handlePickUnit(option.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Vikter lagras alltid i kg. Valet ändrar hur de visas och matas
          in, både här och på webben.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.cardTitle}>Vilotimer</Text>
          <Switch
            value={restTimer.enabled}
            onValueChange={handleToggleRestTimer}
          />
        </View>

        {restTimer.enabled && (
          <>
            <View style={styles.chipRow}>
              {REST_TIMER_PRESETS.map((preset) => {
                const active =
                  !customInvalid && restTimer.seconds === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => handlePickPreset(preset)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {preset} s
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Eget värde (sekunder)</Text>
            <TextInput
              style={[styles.input, customInvalid && styles.inputInvalid]}
              value={customDraft}
              onChangeText={handleCustomChange}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            {customInvalid && (
              <Text style={styles.fieldError}>
                Ange ett heltal mellan 5 och 600 sekunder.
              </Text>
            )}
          </>
        )}

        <Text style={styles.hint}>
          Timern startar när du skriver in ett nytt set och vibrerar när
          den är slut. Den kräver att appen är öppen.
        </Text>
      </View>

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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: colors.accentGhost,
    borderColor: colors.accentTint,
  },
  chipText: {
    color: colors.inkSecondary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.accentDeep,
  },
  label: {
    color: colors.inkSecondary,
    fontSize: 14,
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
  inputInvalid: {
    borderColor: colors.danger,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  linkText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 8,
  },
});
