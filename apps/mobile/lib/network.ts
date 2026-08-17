import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

function deriveOnline(state: NetInfoState): boolean {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

// En enda delad NetInfo-prenumeration för hela appen - useIsOnline()
// och onReconnect() lyssnar på samma källa istället för att varje
// anropsplats öppnar sin egen native-lyssnare.
let online = true;
const listeners = new Set<(online: boolean) => void>();

NetInfo.addEventListener((state) => {
  const next = deriveOnline(state);
  if (next === online) return;
  online = next;
  for (const listener of listeners) listener(online);
});

export function getOnlineStatus(): boolean {
  return online;
}

export function useIsOnline(): boolean {
  const [value, setValue] = useState(online);

  useEffect(() => {
    setValue(online);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}

export function onReconnect(callback: () => void): () => void {
  let wasOnline = online;
  const listener = (next: boolean) => {
    if (next && !wasOnline) callback();
    wasOnline = next;
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
