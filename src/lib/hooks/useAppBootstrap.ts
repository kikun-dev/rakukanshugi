import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bootstrapUserData,
  refreshUserDataFromRemote,
  syncOutboundChanges,
} from "../store";

type BootstrapPhase = "idle" | "bootstrapping" | "ready" | "error";

type BootstrapState = {
  phase: BootstrapPhase;
  message?: string;
};

type SyncState = {
  isSyncing: boolean;
  lastSyncedAt?: string;
  error?: string;
};

const BOOTSTRAP_ERROR_MESSAGE = "データの初期化に失敗しました";
const SYNC_ERROR_MESSAGE = "同期に失敗しました";
const SYNC_INTERVAL_MS = 60_000;

export function useAppBootstrap(userId?: string) {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ phase: "idle" });
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>({ isSyncing: false });
  const isMountedRef = useRef(true);
  const syncInFlightRef = useRef(false);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    setSyncState({ isSyncing: false, lastSyncedAt: undefined, error: undefined });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setBootstrapState({ phase: "idle" });
      return;
    }

    const targetUserId = userId as string;
    let cancelled = false;

    async function runBootstrap() {
      setBootstrapState({ phase: "bootstrapping" });
      try {
        await bootstrapUserData(targetUserId);
        if (!cancelled) {
          setBootstrapState({ phase: "ready" });
        }
      } catch (error) {
        console.error("Failed to bootstrap user data", error);
        if (!cancelled) {
          setBootstrapState({
            phase: "error",
            message: error instanceof Error ? error.message : BOOTSTRAP_ERROR_MESSAGE,
          });
        }
      }
    }

    runBootstrap();

    return () => {
      cancelled = true;
    };
  }, [userId, bootstrapAttempt]);

  const triggerSync = useCallback(async () => {
    if (!userId || !isMountedRef.current) return;
    if (syncInFlightRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const targetUserId = userId as string;

    syncInFlightRef.current = true;
    setSyncState((prev) => ({ ...prev, isSyncing: true, error: undefined }));

    let refreshed = false;
    let errorMessage: string | undefined;

    try {
      try {
        await syncOutboundChanges(targetUserId);
      } catch (error) {
        console.warn("Failed to push pending changes", error);
        if (!errorMessage) {
          errorMessage = error instanceof Error ? error.message : SYNC_ERROR_MESSAGE;
        }
      }

      try {
        await refreshUserDataFromRemote(targetUserId);
        refreshed = true;
      } catch (error) {
        console.warn("Failed to refresh user data", error);
        errorMessage = error instanceof Error ? error.message : SYNC_ERROR_MESSAGE;
      }
    } finally {
      if (isMountedRef.current) {
        setSyncState((prev) => ({
          isSyncing: false,
          lastSyncedAt: refreshed ? new Date().toISOString() : prev.lastSyncedAt,
          error: errorMessage,
        }));
      }
      syncInFlightRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || bootstrapState.phase !== "ready") return;

    const attemptInitialSync = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void triggerSync();
    };

    attemptInitialSync();

    if (typeof window === "undefined") {
      return undefined;
    }

    const handleOnline = () => {
      attemptInitialSync();
    };

    window.addEventListener("online", handleOnline);
    const intervalId = window.setInterval(() => {
      attemptInitialSync();
    }, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(intervalId);
    };
  }, [userId, bootstrapState.phase, triggerSync]);

  const retryBootstrap = useCallback(() => {
    setBootstrapAttempt((prev) => prev + 1);
  }, []);

  const didBootstrap = bootstrapState.phase === "ready";
  const isBootstrapping = bootstrapState.phase === "bootstrapping";
  const bootstrapError = bootstrapState.phase === "error" ? bootstrapState.message : undefined;

  const hasSyncedOnce = useMemo(() => Boolean(syncState.lastSyncedAt), [syncState.lastSyncedAt]);

  return {
    isBootstrapping,
    didBootstrap,
    bootstrapError,
    retryBootstrap,
    isSyncing: syncState.isSyncing,
    syncError: syncState.error,
    lastSyncedAt: syncState.lastSyncedAt,
    hasSyncedOnce,
    triggerSync,
  } as const;
}







