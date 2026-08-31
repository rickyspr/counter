import { elapsedMinutes, formatDuration } from "@counter/shared";
import { useEffect, useState } from "react";
import { AppState, type AppStateStatus, StyleSheet, Text } from "react-native";
import { colors } from "../lib/theme";

// Visningen är i minutupplösning, så en sekundtickare hade bara väckt
// skärmen 60 gånger i onödan mellan varje ändrad siffra. 15 s är tätt nog
// att minuten aldrig ser ut att fastna men glest nog att inte märkas.
const TICK_MS = 15_000;

export function ActiveWorkoutTimer({ startedAt }: { startedAt: string }) {
  const [minutes, setMinutes] = useState<number>(() => elapsedMinutes(startedAt));

  useEffect(() => {
    const recompute = () => setMinutes(elapsedMinutes(startedAt));
    recompute();

    const interval = setInterval(recompute, TICK_MS);
    // Intervallet pausas när appen är i bakgrunden - räkna om direkt när
    // den blir aktiv igen så siffran inte släpar efter en lång paus.
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") recompute();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [startedAt]);

  return (
    <Text style={styles.text}>
      {minutes === 0 ? "Startade nyss" : `Igång i ${formatDuration(minutes)}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "left",
  },
});
