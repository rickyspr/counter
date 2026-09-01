import { useEffect, useState } from "react";
import { readJSON, writeJSON } from "./storage";

// Vilotimern mellan set: av som förval, global tid, lagrad lokalt i
// AsyncStorage (inte i profilen - den hör inte hemma i synk och behöver
// inte följa med mellan enheter). Startar av sig själv när ett nytt set
// skrivs och vibrerar när den går ut; se RestTimerBar.tsx.

export interface RestTimerSettings {
  enabled: boolean;
  seconds: number;
}

export const DEFAULT_REST_TIMER: RestTimerSettings = {
  enabled: false,
  seconds: 90,
};

export const REST_TIMER_PRESETS = [60, 90, 120, 180] as const;
export const REST_TIMER_MIN_SECONDS = 5;
export const REST_TIMER_MAX_SECONDS = 600;

const STORAGE_KEY = "counter:rest-timer";

// Heltal inom [MIN, MAX], annars null (fältet visas rött och sparas inte).
export function parseRestSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  if (n < REST_TIMER_MIN_SECONDS || n > REST_TIMER_MAX_SECONDS) return null;
  return n;
}

function normalize(raw: unknown): RestTimerSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_REST_TIMER;
  const value = raw as Partial<RestTimerSettings>;
  const seconds =
    typeof value.seconds === "number" && Number.isFinite(value.seconds)
      ? Math.min(
          REST_TIMER_MAX_SECONDS,
          Math.max(REST_TIMER_MIN_SECONDS, Math.round(value.seconds)),
        )
      : DEFAULT_REST_TIMER.seconds;
  return { enabled: value.enabled === true, seconds };
}

export async function loadRestTimerSettings(): Promise<RestTimerSettings> {
  try {
    return normalize(await readJSON<unknown>(STORAGE_KEY, null));
  } catch {
    return DEFAULT_REST_TIMER;
  }
}

export async function saveRestTimerSettings(
  settings: RestTimerSettings,
): Promise<void> {
  await writeJSON(STORAGE_KEY, normalize(settings));
}

// Läser inställningen EN gång vid mount. Ingen prenumeration: Inställningar
// är onåbart under ett pågående pass (flikraden är dold), och passkärmen
// monteras om varje gång man går in i den - så ett värde som ändrats
// mellan två pass hinner alltid läsas färskt.
export function useRestTimerSettings(): RestTimerSettings {
  const [settings, setSettings] = useState<RestTimerSettings>(DEFAULT_REST_TIMER);

  useEffect(() => {
    let cancelled = false;
    loadRestTimerSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
