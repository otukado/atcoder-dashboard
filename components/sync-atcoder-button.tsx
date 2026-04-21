"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncResult = {
  fetchedSubmissions: number;
  syncedAcceptedSubmissions: number;
  syncedProblems: number;
  syncedAt?: string;
  message?: string;
};

type SyncProgress = {
  phase: "idle" | "fetching" | "saving-problems" | "saving-submissions" | "done" | "error";
  fetchedSubmissions: number;
  totalProblems: number;
  savedProblems: number;
  totalSubmissions: number;
  savedSubmissions: number;
  message: string;
  updatedAt: number;
};

const CACHE_KEY = "atcoder-sync-cache";

export function SyncAtCoderButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const runSync = async () => {
    setPending(true);
    setMessage(null);
    setProgressMessage("同期を開始しています...");
    setIsError(false);

    let polling = true;
    const pollProgress = async () => {
      try {
        const res = await fetch("/api/sync/atcoder", { method: "GET", cache: "no-store" });
        const body = (await res.json()) as { progress?: SyncProgress | null };
        const progress = body.progress;
        if (!progress) {
          return;
        }

        if (progress.phase === "fetching") {
          setProgressMessage(`提出データ取得中: ${progress.fetchedSubmissions} 件`);
          return;
        }

        if (progress.phase === "saving-problems") {
          setProgressMessage(`問題保存中: ${progress.savedProblems} / ${progress.totalProblems}`);
          return;
        }

        if (progress.phase === "saving-submissions") {
          setProgressMessage(`提出保存中: ${progress.savedSubmissions} / ${progress.totalSubmissions}`);
          return;
        }

        if (progress.phase === "done") {
          setProgressMessage("同期完了");
          return;
        }

        if (progress.phase === "error") {
          setProgressMessage(progress.message);
        }
      } catch {
        // ポーリング失敗は無視して継続
      }
    };

    const pollLoop = async () => {
      while (polling) {
        await pollProgress();
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    };

    const pollPromise = pollLoop();

    try {
      const res = await fetch("/api/sync/atcoder", { method: "POST" });
      const body = (await res.json()) as SyncResult;

      if (!res.ok) {
        setIsError(true);
        setMessage(body.message ?? "同期に失敗しました。時間をおいて再試行してください。");
        return;
      }

      setMessage(
        `同期完了: 提出 ${body.fetchedSubmissions} 件 / AC ${body.syncedAcceptedSubmissions} 件 / 問題 ${body.syncedProblems} 件`,
      );
      setProgressMessage(null);
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(body));
      router.refresh();
    } catch {
      setIsError(true);
      setMessage("通信エラーが発生しました。ネットワーク状態を確認して再試行してください。");
    } finally {
      polling = false;
      await pollPromise;
      setPending(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={runSync}
        disabled={pending}
        className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        {pending ? "同期中..." : "AtCoderデータを同期"}
      </button>

      {message ? (
        <p
          className={`mt-2 text-sm ${
            isError ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
          }`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      {pending && progressMessage ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300" role="status" aria-live="polite">
          {progressMessage}
        </p>
      ) : null}
    </div>
  );
}
