import { formatCountdown } from "@counter/shared";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii } from "../lib/theme";

interface Props {
  endsAt: number; // epoch ms - ABSOLUT måltid
  onAddTime: () => void; // +30 s
  onSkip: () => void;
  onExpire: () => void; // avfyras exakt en gång
}

const TICK_MS = 1000;

// Nedräkning mellan två set. Speglar ActiveWorkoutTimer: sekundtickare
// plus en AppState-lyssnare som räknar om vid "active" så siffran är rätt
// direkt efter att appen kommer tillbaka från fickan. Måltiden är
// absolut, så bakgrundstid räknas inte fel.
export function RestTimerBar({ endsAt, onAddTime, onSkip, onExpire }: Props) {
  const remainingFor = () =>
    Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(remainingFor);
  // En rad-lokal vakt så onExpire bara avfyras en gång per nedräkning.
  const expired = useRef(false);

  useEffect(() => {
    expired.current = false;

    const recompute = () => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !expired.current) {
        expired.current = true;
        // Vibrationen ligger här, inte hos anroparen: bara i förgrunden -
        // en notis i bakgrunden är inte i scope.
        if (AppState.currentState === "active") {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }
        onExpire();
      }
    };
    recompute();

    const interval = setInterval(recompute, TICK_MS);
    const subscription = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        if (status === "active") recompute();
      },
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [endsAt, onExpire]);

  return (
    <View style={styles.bar}>
      <Text style={styles.label}>Vila {formatCountdown(remaining)}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onAddTime}>
          <Text style={styles.action}>+30 s</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip}>
          <Text style={styles.action}>Hoppa över</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accentGhost,
    borderWidth: 1,
    borderColor: colors.accentTint,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: {
    color: colors.accentDeep,
    fontSize: 15,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 16,
  },
  action: {
    color: colors.accentDeep,
    fontWeight: "600",
  },
});
