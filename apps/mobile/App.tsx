import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { TabBar } from "./components/TabBar";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { subscribeToSyncErrors } from "./lib/offline-queue";
import { ActiveWorkoutScreen } from "./screens/ActiveWorkoutScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProfileScreen } from "./screens/ProfileScreen";

type Screen =
  | { name: "home" }
  | { name: "profile" }
  | { name: "workout"; workoutId: string };

function AppContent() {
  const { session, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const userId = session?.user.id;

  useEffect(
    () =>
      subscribeToSyncErrors((message) => {
        Alert.alert("Kunde inte synka en ändring", message);
      }),
    [],
  );

  // Utan detta ligger `screen` kvar över en utloggning. Det syns inte
  // direkt (LoginScreen returneras före workout-grenen nedan), men
  // loggar någon annan in på samma telefon renderas pass-skärmen med
  // föregående användares workoutId.
  useEffect(() => {
    setScreen({ name: "home" });
  }, [userId]);

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

  // Flikraden göms under ett pågående pass: där ska man avsluta eller
  // avbryta, inte navigera bort mitt i loggningen.
  if (screen.name === "workout") {
    return (
      <ActiveWorkoutScreen
        userId={session.user.id}
        workoutId={screen.workoutId}
        onFinish={() => setScreen({ name: "home" })}
        onDiscard={() => setScreen({ name: "home" })}
      />
    );
  }

  return (
    <View style={styles.flex}>
      {screen.name === "profile" ? (
        <ProfileScreen session={session} />
      ) : (
        <HomeScreen
          userId={session.user.id}
          onOpenWorkout={(workoutId) =>
            setScreen({ name: "workout", workoutId })
          }
        />
      )}
      <TabBar
        active={screen.name}
        onSelect={(tab) =>
          setScreen(tab === "home" ? { name: "home" } : { name: "profile" })
        }
      />
    </View>
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
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
