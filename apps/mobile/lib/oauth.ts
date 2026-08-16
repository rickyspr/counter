import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

// Krävs av expo-web-browser för att stänga den öppna auth-sessionen när
// appen får kontrollen tillbaka via redirect-URL:en.
WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = AuthSession.makeRedirectUri({ path: "auth-callback" });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Kunde inte starta Google-inloggningen.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    throw new Error("Inloggningen avbröts.");
  }

  const code = new URL(result.url).searchParams.get("code");
  if (!code) {
    throw new Error("Fick ingen inloggningskod tillbaka från Google.");
  }

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
  if (sessionError) throw sessionError;
}
