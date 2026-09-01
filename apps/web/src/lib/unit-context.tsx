import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchProfile } from "@counter/shared";
import type { Unit } from "@counter/shared";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";

// Webben är read-only: den LÄSER profiles.unit och skriver aldrig. Enheten
// styr hur varje vikt visas (kompisars pass i betraktarens enhet).

const UnitContext = createContext<Unit | undefined>(undefined);

export function UnitProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [unit, setUnit] = useState<Unit | null>(null);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user.id;
    if (!userId) {
      setUnit("kg");
      return;
    }
    fetchProfile(supabase, userId)
      .then((profile) => {
        if (!cancelled) setUnit(profile.unit);
      })
      .catch(() => {
        if (!cancelled) setUnit("kg");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (unit === null) return <p className="status">Laddar…</p>;

  return <UnitContext.Provider value={unit}>{children}</UnitContext.Provider>;
}

export function useUnit(): Unit {
  const context = useContext(UnitContext);
  if (context === undefined) {
    throw new Error("useUnit måste användas inuti en UnitProvider");
  }
  return context;
}
