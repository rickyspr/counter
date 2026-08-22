import { useEffect, useState } from "react";
import { subscribeToPendingMediaIds } from "./media-queue";
import { useIsOnline } from "./network";
import { subscribeToPendingCount } from "./offline-queue";

export interface SyncStatus {
  online: boolean;
  pendingCount: number;
  // Filer som väntar i uppladdningskön. Hålls isär från pendingCount
  // eftersom de två köerna arbetar oberoende av varandra och i helt
  // olika tempo - se media-queue.ts.
  pendingMediaCount: number;
}

export function useSyncStatus(): SyncStatus {
  const online = useIsOnline();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingMediaCount, setPendingMediaCount] = useState(0);

  useEffect(() => subscribeToPendingCount(setPendingCount), []);
  useEffect(
    () => subscribeToPendingMediaIds((ids) => setPendingMediaCount(ids.length)),
    [],
  );

  return { online, pendingCount, pendingMediaCount };
}
