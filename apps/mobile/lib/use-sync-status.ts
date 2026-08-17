import { useEffect, useState } from "react";
import { useIsOnline } from "./network";
import { subscribeToPendingCount } from "./offline-queue";

export interface SyncStatus {
  online: boolean;
  pendingCount: number;
}

export function useSyncStatus(): SyncStatus {
  const online = useIsOnline();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => subscribeToPendingCount(setPendingCount), []);

  return { online, pendingCount };
}
