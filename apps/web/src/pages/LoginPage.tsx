import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <h1>RepCount</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="E-post"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Lösenord"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {message && <p className="message">{message}</p>}
        <button type="submit" disabled={loading}>
          {loading
            ? "Laddar…"
            : mode === "login"
              ? "Logga in"
              : "Skapa konto"}
        </button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login"
          ? "Inget konto? Skapa ett"
          : "Har du redan ett konto? Logga in"}
      </button>
    </div>
  );
}
