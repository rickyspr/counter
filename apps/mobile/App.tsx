import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { subscribeToSyncErrors } from "./lib/offline-queue";
import { ActiveWorkoutScreen } from "./screens/ActiveWorkoutScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";

type Screen = { name: "home" } | { name: "workout"; workoutId: string };

function AppContent() {
  const { session, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(
    () =>
      subscribeToSyncErrors((message) => {
        Alert.alert("Kunde inte synka en ändring", message);
      }),
    [],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (screen.name === "workout") {
    return (
      <ActiveWorkoutScreen
        workoutId={screen.workoutId}
        onFinish={() => setScreen({ name: "home" })}
      />
    );
  }

  return (
    <HomeScreen
      userId={session.user.id}
      onStartWorkout={(workoutId) => setScreen({ name: "workout", workoutId })}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
