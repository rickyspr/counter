import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

export function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Delas av lösenords- och Google-flödet: sätter laddningsflaggan,
  // nollställer felmeddelandet, och visar felet om action() kastar.
  async function runAuthAction(
    setLoadingFlag: (value: boolean) => void,
    action: () => Promise<void>,
  ) {
    setLoadingFlag(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setLoadingFlag(false);
    }
  }

  function handleSubmit() {
    return runAuthAction(setLoading, async () => {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (!data.session) {
          setMessage(
            "Kontrollera din mejl för att bekräfta kontot, logga sedan in.",
          );
        }
      }
    });
  }

  function handleGoogleSignIn() {
    // Laddas bara in när knappen faktiskt trycks, inte vid appstart -
    // expo-auth-session/expo-web-browser behövs annars aldrig för de
    // som bara loggar in med e-post.
    return runAuthAction(setGoogleLoading, async () => {
      const { signInWithGoogle } = await import("../lib/oauth");
      await signInWithGoogle();
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RepCount</Text>

      <TextInput
        style={styles.input}
        placeholder="E-post"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Lösenord"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {message && <Text style={styles.message}>{message}</Text>}

      <TouchableOpacity
        style={[styles.pillButton, styles.button]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {mode === "login" ? "Logga in" : "Skapa konto"}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setMode(mode === "login" ? "signup" : "login")}
      >
        <Text style={styles.switchText}>
          {mode === "login"
            ? "Inget konto? Skapa ett"
            : "Har du redan ett konto? Logga in"}
        </Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>eller</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.pillButton, styles.googleButton]}
        onPress={handleGoogleSignIn}
        disabled={googleLoading}
      >
        {googleLoading ? (
          <ActivityIndicator color="#111827" />
        ) : (
          <Text style={styles.googleButtonText}>Logga in med Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  message: {
    color: "#b91c1c",
    textAlign: "center",
  },
  pillButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  button: {
    backgroundColor: "#111827",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchText: {
    textAlign: "center",
    color: "#2563eb",
    marginTop: 8,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  dividerText: {
    color: "#6b7280",
    fontSize: 13,
  },
  googleButton: {
    borderWidth: 1,
    borderColor: "#ccc",
  },
  googleButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
});
