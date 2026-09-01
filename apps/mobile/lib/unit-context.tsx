import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getLocales } from "expo-localization";
import { defaultUnitForLocale, type Unit } from "@counter/shared";
import { useAuth } from "./auth-context";
import { getOnlineStatus } from "./network";
import { fetchProfile, updateUnitPreference } from "./profile";
import { readJSON, writeJSON } from "./storage";

// Enheten (kg/lbs) som varje viktyta i appen läser. Mönstret är
// greeting-name.ts: cachad per användare i AsyncStorage så valet finns
// offline, med profilen som sanning när nätet finns. Ingen laddningsgrind
// - state börjar på "kg" och byts när cachen/profilen svarar.

interface UnitContextValue {
  unit: Unit;
  setUnit: (next: Unit) => Promise<void>; // kastar utan uppkoppling
}

const UnitContext = createContext<UnitContextValue | undefined>(undefined);

const cacheKey = (userId: string) => `counter:unit:${userId}`;

function localeUnit(): Unit {
  const locale = getLocales()[0];
  return defaultUnitForLocale(
    locale
      ? {
          regionCode: locale.regionCode,
          measurementSystem: locale.measurementSystem,
        }
      : null,
  );
}

export function UnitProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [unit, setUnitState] = useState<Unit>("kg");

  useEffect(() => {
    if (!userId) {
      setUnitState("kg");
      return;
    }
    let cancelled = false;
    const key = cacheKey(userId);

    readJSON<Unit | null>(key, null)
      .then((cached) => {
        if (!cancelled && (cached === "kg" || cached === "lbs")) {
          setUnitState(cached);
        }
      })
      .catch(() => {});

    fetchProfile(userId)
      .then((profile) => {
        if (cancelled) return;
        if (profile.unitChosenAt !== null) {
          setUnitState(profile.unit);
          writeJSON(key, profile.unit).catch(() => {});
          return;
        }
        // Ingen medveten enhet ännu: sätt regionsdefaulten en gång och
        // spåra den i unit_chosen_at. Fel sväljs - nästa öppning provar
        // igen.
        const derived = localeUnit();
        setUnitState(derived);
        writeJSON(key, derived).catch(() => {});
        updateUnitPreference(userId, derived).catch(() => {});
      })
      .catch(() => {
        // Offline: behåll cachen. Utan cache härleds enheten ur regionen
        // enbart för visning och cachas - ingen skrivning, unit_chosen_at
        // förblir null tills servern nås.
        if (cancelled) return;
        readJSON<Unit | null>(key, null)
          .then((cached) => {
            if (cancelled || cached === "kg" || cached === "lbs") return;
            const derived = localeUnit();
            setUnitState(derived);
            writeJSON(key, derived).catch(() => {});
          })
          .catch(() => {});
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setUnit = async (next: Unit): Promise<void> => {
    if (!userId) throw new Error("Du måste vara inloggad för att byta enhet.");
    if (!getOnlineStatus()) {
      throw new Error(
        "Enheten sparas i din profil och kräver internet. Vilotimern går att ställa in ändå.",
      );
    }
    await updateUnitPreference(userId, next);
    setUnitState(next);
    writeJSON(cacheKey(userId), next).catch(() => {});
  };

  return (
    <UnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit(): UnitContextValue {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error("useUnit måste användas inuti en UnitProvider");
  }
  return context;
}
