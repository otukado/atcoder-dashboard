type SyncPhase =
  | "idle"
  | "fetching"
  | "saving-problems"
  | "saving-submissions"
  | "done"
  | "error";

export type SyncProgressState = {
  phase: SyncPhase;
  fetchedSubmissions: number;
  totalProblems: number;
  savedProblems: number;
  totalSubmissions: number;
  savedSubmissions: number;
  message: string;
  updatedAt: number;
};

type GlobalWithSyncProgress = typeof globalThis & {
  __atcoderSyncProgressMap?: Map<string, SyncProgressState>;
};

function getProgressMap(): Map<string, SyncProgressState> {
  const g = globalThis as GlobalWithSyncProgress;
  if (!g.__atcoderSyncProgressMap) {
    g.__atcoderSyncProgressMap = new Map<string, SyncProgressState>();
  }
  return g.__atcoderSyncProgressMap;
}

export function setSyncProgress(
  userId: string,
  next: Omit<SyncProgressState, "updatedAt">,
) {
  getProgressMap().set(userId, {
    ...next,
    updatedAt: Date.now(),
  });
}

export function getSyncProgress(userId: string): SyncProgressState | null {
  return getProgressMap().get(userId) ?? null;
}

export function clearSyncProgress(userId: string) {
  getProgressMap().delete(userId);
}
