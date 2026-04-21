"use client";

import { useEffect, useState } from "react";

import { getAppTimeZone } from "@/lib/time-zone";

type CachedSyncResult = {
  fetchedSubmissions: number;
  syncedAcceptedSubmissions: number;
  syncedProblems: number;
  syncedAt?: string;
};

const CACHE_KEY = "atcoder-sync-cache";

export function LastSyncCacheNotice() {
  const [cached, setCached] = useState<CachedSyncResult | null>(null);

  useEffect(() => {
    let frameId: number | null = null;

    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as CachedSyncResult;
      if (
        typeof parsed.fetchedSubmissions === "number" &&
        typeof parsed.syncedAcceptedSubmissions === "number" &&
        typeof parsed.syncedProblems === "number"
      ) {
        frameId = window.requestAnimationFrame(() => {
          setCached(parsed);
        });
      }
    } catch {
      // ignore invalid cache
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  if (!cached) {
    return null;
  }

  const syncedAtText = cached.syncedAt
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: getAppTimeZone(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(cached.syncedAt))
    : "時刻不明";

  return (
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
      前回同期キャッシュ: {syncedAtText}（提出 {cached.fetchedSubmissions} 件 / AC {cached.syncedAcceptedSubmissions} 件 / 問題 {cached.syncedProblems} 件）
    </p>
  );
}
