import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { TabBar } from "./components/TabBar";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { subscribeToMediaErrors } from "./lib/media-queue";
import { clearMediaUrlCache } from "./lib/media-urls";
import { subscribeToSyncErrors } from "./lib/offline-queue";
import { ActiveWorkoutScreen } from "./screens/ActiveWorkoutScreen";
import { EditWorkoutScreen } from "./screens/EditWorkoutScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ProfileSettingsScreen } from "./screens/ProfileSettingsScreen";

type Screen =
  | { name: "home" }
  | { name: "profile" }
  | { name: "profile-settings" }
  | { name: "workout"; workoutId: string }
  | { name: "edit-workout"; workoutId: string };

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

  // Egen kanal, inte samma som ovan: uppladdningskön är en helt separat
  // kö (se media-queue.ts) och dess fel handlar om en fil, inte om en
  // ändring som inte gick fram.
  useEffect(
    () =>
      subscribeToMediaErrors((message) => {
        Alert.alert("Kunde inte ladda upp media", message);
      }),
    [],
  );

  // Utan detta ligger `screen` kvar över en utloggning. Det syns inte
  // direkt (LoginScreen returneras före workout-grenen nedan), men
  // loggar någon annan in på samma telefon renderas pass-skärmen med
  // föregående användares workoutId.
  //
  // De signerade URL:erna släpps av samma skäl: de hör till den som var
  // inloggad.
  useEffect(() => {
    setScreen({ name: "home" });
    clearMediaUrlCache();
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

  // Egen gren i routern, inte en modal ovanpå profilen. Två skäl:
  // övningsväljaren är redan en modal, och nästlade helskärmsmodaler är
  // ostadiga på iOS - och att lämna profilen tvingar fram den omladdning
  // av historik och statistik som ändå behövs efter en ändring.
  if (screen.name === "edit-workout") {
    return (
      <EditWorkoutScreen
        userId={session.user.id}
        workoutId={screen.workoutId}
        onClose={() => setScreen({ name: "profile" })}
      />
    );
  }

  // Same shape as edit-workout, and for the same two reasons: the tab
  // bar has no business being visible in a subpage you have to leave
  // deliberately, and coming back re-mounts ProfileScreen, which is
  // what reloads the profile after it has been changed.
  if (screen.name === "profile-settings") {
    return (
      <ProfileSettingsScreen
        session={session}
        onClose={() => setScreen({ name: "profile" })}
      />
    );
  }

  return (
    <View style={styles.flex}>
      {screen.name === "profile" ? (
        <ProfileScreen
          session={session}
          onEditWorkout={(workoutId) =>
            setScreen({ name: "edit-workout", workoutId })
          }
          onOpenSettings={() => setScreen({ name: "profile-settings" })}
        />
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
