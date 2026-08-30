import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { fallbackDisplayName, firstName } from "@counter/shared";
import { useEffect, useState } from "react";
import { fetchProfile } from "./profile";

const CACHE_KEY = "greeting-name";

// Förnamnet att tilltala användaren med i Hem-hälsningen och i berömmet
// efter ett avslutat pass. Hämtas ur profilen, faller tillbaka på
// sessionens metadata, och cachas i AsyncStorage så att hälsningen har
// ett namn även offline och innan profilen hunnit laddas. Tomt =
// tilltala utan namn (hellre det än en e-postadress eller "Namnlös").
export function useGreetingName(session: Session | null): string {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    AsyncStorage.getItem(CACHE_KEY)
      .then((cached) => {
        if (!cancelled && cached) setName((current) => current || cached);
      })
      .catch(() => {});

    const fromSession = firstName(fallbackDisplayName(session));

    const store = (resolved: string) => {
      if (cancelled) return;
      setName(resolved);
      AsyncStorage.setItem(CACHE_KEY, resolved).catch(() => {});
    };

    fetchProfile(session.user.id)
      .then((profile) => store(firstName(profile.displayName) || fromSession))
      .catch(() => {
        // Ingen uppkoppling: sessionens metadata är bättre än inget, och
        // cachen kan redan ha fyllt i ett namn ovan.
        if (fromSession) store(fromSession);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return name;
}
