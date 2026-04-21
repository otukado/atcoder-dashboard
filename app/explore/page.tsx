import Link from "next/link";
import { getServerSession } from "next-auth";

import { TabbedCountCharts } from "@/components/tabbed-count-charts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SolveCategory = "DURING_CONTEST" | "PRACTICE_NO_EDITORIAL" | "PRACTICE_WITH_EDITORIAL";

type LocalSubmissionRow = {
  epochSecond: number;
  estimatedDurationSec: number | null;
  category: SolveCategory;
  problem: {
    difficulty: number | null;
  };
};

type AtCoderSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  result: string;
};

type AtCoderProblemModel = {
  id: string;
  difficulty?: number;
};

type DbForExplore = {
  submission: {
    findMany: (args: unknown) => Promise<LocalSubmissionRow[]>;
  };
  userProfile: {
    findUnique: (args: unknown) => Promise<{ atcoderUserId: string | null } | null>;
  };
};

function difficultyBucket(difficulty: number | null): string {
  if (difficulty === null) return "不明";
  const start = Math.floor(difficulty / 400) * 400;
  const end = start + 399;
  return `${start}-${end}`;
}

function bucketStart(bucket: string): number | null {
  const m = bucket.match(/^(\d+)-\d+$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function compareBucketsAsc(a: string, b: string): number {
  const aa = bucketStart(a);
  const bb = bucketStart(b);
  if (aa === null && bb === null) return a.localeCompare(b);
  if (aa === null) return 1;
  if (bb === null) return -1;
  return aa - bb;
}

function difficultyColorByBucket(bucket: string): string {
  const start = bucketStart(bucket);
  if (start === null) return "#000000";
  if (start < 400) return "#6b7280";
  if (start < 800) return "#8b5a2b";
  if (start < 1200) return "#16a34a";
  if (start < 1600) return "#06b6d4";
  if (start < 2000) return "#2563eb";
  if (start < 2400) return "#ca8a04";
  if (start < 2800) return "#ea580c";
  return "#dc2626";
}

type ExplorePageProps = {
  searchParams?: Promise<{
    user?: string;
    range?: string;
    start?: string;
    end?: string;
    dailyView?: string;
    weeklyView?: string;
  }>;
};

function problemLetter(problemId: string): string {
  const m = problemId.match(/_([a-z])$/i);
  if (!m) return "Others";
  return m[1].toUpperCase();
}

function letterColor(label: string): string {
  const colorMap: Record<string, string> = {
    A: "#22c55e",
    B: "#06b6d4",
    C: "#3b82f6",
    D: "#8b5cf6",
    E: "#ec4899",
    F: "#f97316",
    G: "#ef4444",
    H: "#a855f7",
    Others: "#6b7280",
  };

  return colorMap[label] ?? "#6b7280";
}

function toDayKey(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(0, 10);
}

function dayStartEpoch(dateText: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null;
  }
  const date = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.floor(date.getTime() / 1000);
}

function dayEndEpoch(dateText: string): number | null {
  const start = dayStartEpoch(dateText);
  if (start === null) return null;
  return start + 86400 - 1;
}

function formatDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(0, 10);
}

function getTodayJstStartEpoch(): number {
  const todayText = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return dayStartEpoch(todayText) ?? Math.floor(Date.now() / 1000);
}

function weekKeyJst(epochSecond: number): string {
  const d = new Date((epochSecond + 9 * 3600) * 1000);
  const day = d.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

async function fetchAtCoderAcSubmissions(atcoderUserId: string): Promise<AtCoderSubmission[]> {
  const submissions: AtCoderSubmission[] = [];
  const seenSubmissionIds = new Set<number>();
  let fromSecond = 0;

  while (true) {
    const res = await fetch(
      `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(
        atcoderUserId,
      )}&from_second=${fromSecond}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      throw new Error("AtCoder提出データの取得に失敗しました。");
    }

    const batch = (await res.json()) as AtCoderSubmission[];
    if (batch.length === 0) {
      break;
    }

    let addedCount = 0;
    for (const s of batch) {
      if (seenSubmissionIds.has(s.id)) {
        continue;
      }
      seenSubmissionIds.add(s.id);
      if (s.result === "AC") {
        submissions.push(s);
      }
      addedCount += 1;
    }

    if (addedCount === 0) {
      break;
    }

    const lastEpoch = batch[batch.length - 1]?.epoch_second;
    if (typeof lastEpoch !== "number") {
      break;
    }

    fromSecond = lastEpoch;

    if (batch.length < 500) {
      break;
    }
  }

  return submissions;
}

async function fetchProblemModels(): Promise<Record<string, AtCoderProblemModel>> {
  const res = await fetch("https://kenkoooo.com/atcoder/resources/problem-models.json", {
    cache: "force-cache",
  });

  if (!res.ok) {
    throw new Error("problem-models の取得に失敗しました。");
  }

  return (await res.json()) as Record<string, AtCoderProblemModel>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const db = prisma as unknown as DbForExplore;
  const session = await getServerSession(authOptions);
  const currentUserId = session?.user?.id ?? null;

  const params = (await searchParams) ?? {};
  const selectedAtcoderUserId = (params.user ?? "").trim();
  const selectedRange = params.range ?? "30";
  const dailyView: "difficulty" | "letter" = params.dailyView === "letter" ? "letter" : "difficulty";
  const weeklyView: "difficulty" | "letter" = params.weeklyView === "letter" ? "letter" : "difficulty";

  const todayStartEpoch = getTodayJstStartEpoch();
  const todayEndEpoch = todayStartEpoch + 86400 - 1;

  let startEpoch: number | undefined;
  let endEpoch: number | undefined;

  if (selectedRange === "7" || selectedRange === "30" || selectedRange === "90") {
    const days = Number(selectedRange);
    startEpoch = todayStartEpoch - (days - 1) * 86400;
    endEpoch = todayEndEpoch;
  } else if (selectedRange === "custom") {
    const s = params.start ? dayStartEpoch(params.start) : null;
    const e = params.end ? dayEndEpoch(params.end) : null;
    if (s !== null && e !== null && s <= e) {
      startEpoch = s;
      endEpoch = e;
    }
  }

  let fetchError: string | null = null;
  let acSubmissions: AtCoderSubmission[] = [];
  let problemModels: Record<string, AtCoderProblemModel> = {};

  if (selectedAtcoderUserId.length > 0) {
    try {
      [acSubmissions, problemModels] = await Promise.all([
        fetchAtCoderAcSubmissions(selectedAtcoderUserId),
        fetchProblemModels(),
      ]);
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "AtCoderデータ取得中にエラーが発生しました。";
    }
  }

  const filteredSubmissions = acSubmissions.filter((s) => {
    if (startEpoch !== undefined && s.epoch_second < startEpoch) return false;
    if (endEpoch !== undefined && s.epoch_second > endEpoch) return false;
    return true;
  });

  const diffMap = new Map<string, number>();
  const dailyMap = new Map<string, number>();
  const weeklyMap = new Map<string, number>();
  const dailyDifficultyMap = new Map<string, Map<string, number>>();
  const dailyLetterMap = new Map<string, Map<string, number>>();
  const weeklyDifficultyMap = new Map<string, Map<string, number>>();
  const weeklyLetterMap = new Map<string, Map<string, number>>();

  const letterOrder = ["A", "B", "C", "D", "E", "F", "G", "H", "Others"];

  for (const s of filteredSubmissions) {
    const difficulty = problemModels[s.problem_id]?.difficulty;
    const normalizedDifficulty = typeof difficulty === "number" ? Math.max(0, Math.round(difficulty)) : null;
    const bucket = difficultyBucket(normalizedDifficulty);
    diffMap.set(bucket, (diffMap.get(bucket) ?? 0) + 1);

    const day = toDayKey(s.epoch_second);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);

    const dailyBucketCounts = dailyDifficultyMap.get(day) ?? new Map<string, number>();
    dailyBucketCounts.set(bucket, (dailyBucketCounts.get(bucket) ?? 0) + 1);
    dailyDifficultyMap.set(day, dailyBucketCounts);

    const letter = problemLetter(s.problem_id);
    const dailyLetterCounts = dailyLetterMap.get(day) ?? new Map<string, number>();
    dailyLetterCounts.set(letter, (dailyLetterCounts.get(letter) ?? 0) + 1);
    dailyLetterMap.set(day, dailyLetterCounts);

    const week = weekKeyJst(s.epoch_second);
    weeklyMap.set(week, (weeklyMap.get(week) ?? 0) + 1);

    const weeklyBucketCounts = weeklyDifficultyMap.get(week) ?? new Map<string, number>();
    weeklyBucketCounts.set(bucket, (weeklyBucketCounts.get(bucket) ?? 0) + 1);
    weeklyDifficultyMap.set(week, weeklyBucketCounts);

    const weeklyLetterCounts = weeklyLetterMap.get(week) ?? new Map<string, number>();
    weeklyLetterCounts.set(letter, (weeklyLetterCounts.get(letter) ?? 0) + 1);
    weeklyLetterMap.set(week, weeklyLetterCounts);
  }

  const ownProfile = currentUserId
    ? await db.userProfile.findUnique({
        where: { userId: currentUserId },
        select: { atcoderUserId: true },
      })
    : null;

  const canViewDuration = Boolean(
    currentUserId &&
      selectedAtcoderUserId.length > 0 &&
      ownProfile?.atcoderUserId?.toLowerCase() === selectedAtcoderUserId.toLowerCase(),
  );

  const ownSubmissions = canViewDuration
    ? await db.submission.findMany({
        where: {
          userId: currentUserId as string,
          result: "AC",
        },
        include: {
          problem: true,
        },
        orderBy: {
          epochSecond: "asc",
        },
      })
    : [];

  const durationByBucket = new Map<string, { sum: number; count: number }>();
  for (const s of ownSubmissions) {
    const bucket = difficultyBucket(s.problem.difficulty);

    if ((s.estimatedDurationSec ?? 0) > 0) {
      const curr = durationByBucket.get(bucket) ?? { sum: 0, count: 0 };
      curr.sum += Math.round((s.estimatedDurationSec ?? 0) / 60);
      curr.count += 1;
      durationByBucket.set(bucket, curr);
    }
  }

  const difficultyRows = [...diffMap.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => compareBucketsAsc(a.bucket, b.bucket));
  const maxDifficulty = Math.max(1, ...difficultyRows.map((r) => r.count));

  const dailyRows = [...dailyMap.entries()]
    .map(([date, count]) => {
      const bucketCounts = dailyDifficultyMap.get(date) ?? new Map<string, number>();
      const letterCounts = dailyLetterMap.get(date) ?? new Map<string, number>();
      const difficultySegments = [...bucketCounts.entries()]
        .map(([bucket, bucketCount]) => ({
          label: bucket,
          count: bucketCount,
          color: difficultyColorByBucket(bucket),
        }))
        .sort((a, b) => compareBucketsAsc(a.label, b.label));
      const letterSegments = letterOrder
        .filter((label) => (letterCounts.get(label) ?? 0) > 0)
        .map((label) => ({
          label,
          count: letterCounts.get(label) ?? 0,
          color: letterColor(label),
        }));

      return { date, count, difficultySegments, letterSegments };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const weeklyRows = [...weeklyMap.entries()]
    .map(([weekStart, count]) => {
      const bucketCounts = weeklyDifficultyMap.get(weekStart) ?? new Map<string, number>();
      const letterCounts = weeklyLetterMap.get(weekStart) ?? new Map<string, number>();
      const difficultySegments = [...bucketCounts.entries()]
        .map(([bucket, bucketCount]) => ({
          label: bucket,
          count: bucketCount,
          color: difficultyColorByBucket(bucket),
        }))
        .sort((a, b) => compareBucketsAsc(a.label, b.label));
      const letterSegments = letterOrder
        .filter((label) => (letterCounts.get(label) ?? 0) > 0)
        .map((label) => ({
          label,
          count: letterCounts.get(label) ?? 0,
          color: letterColor(label),
        }));

      return { weekStart, count, difficultySegments, letterSegments };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const durationRows = [...durationByBucket.entries()]
    .map(([bucket, v]) => ({ bucket, avgMin: v.count > 0 ? v.sum / v.count : 0 }))
    .sort((a, b) => compareBucketsAsc(a.bucket, b.bucket));
  const maxDuration = Math.max(1, ...durationRows.map((r) => r.avgMin));

  const rangeLabel =
    startEpoch !== undefined && endEpoch !== undefined
      ? `${formatDate(startEpoch)} 〜 ${formatDate(endEpoch)}`
      : "全期間";
  const customStartDefault = params.start ?? "";
  const customEndDefault = params.end ?? "";

  const buildExploreHref = (overrides: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    if (selectedAtcoderUserId) search.set("user", selectedAtcoderUserId);
    search.set("range", selectedRange);
    if (params.start) search.set("start", params.start);
    if (params.end) search.set("end", params.end);
    search.set("dailyView", dailyView);
    search.set("weeklyView", weeklyView);

    for (const [key, value] of Object.entries(overrides)) {
      if (!value) {
        search.delete(key);
      } else {
        search.set(key, value);
      }
    }

    return `/explore?${search.toString()}`;
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">他ユーザーのグラフ</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ログインなしでユーザー検索し、difficulty分布を確認できます。</p>
        </div>
        {session?.user?.id ? (
          <Link href="/dashboard" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            ダッシュボードへ戻る
          </Link>
        ) : (
          <Link href="/" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            トップへ戻る
          </Link>
        )}
      </header>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">ユーザー検索</h2>
        <form action="/explore" method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-55 flex-1 flex-col gap-1 text-sm">
            <span>AtCoder ユーザー名</span>
            <input
              type="text"
              name="user"
              defaultValue={selectedAtcoderUserId}
              placeholder="例: tourist"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            検索
          </button>
        </form>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          他ユーザーの difficulty データは、ページ表示ごとに AtCoder API から最新取得します。
        </p>
        {fetchError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fetchError}</p> : null}
      </section>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">期間フィルタ</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={buildExploreHref({ range: "7" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "7"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            7日
          </Link>
          <Link
            href={buildExploreHref({ range: "30" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "30"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            30日
          </Link>
          <Link
            href={buildExploreHref({ range: "90" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "90"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            90日
          </Link>
          <Link
            href={buildExploreHref({ range: "all", start: undefined, end: undefined })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            全期間
          </Link>
        </div>

        <form action="/explore" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          {selectedAtcoderUserId ? <input type="hidden" name="user" value={selectedAtcoderUserId} /> : null}
          <label className="text-sm">
            <span className="mb-1 block">開始日</span>
            <input
              type="date"
              name="start"
              defaultValue={customStartDefault}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block">終了日</span>
            <input
              type="date"
              name="end"
              defaultValue={customEndDefault}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            カスタム適用
          </button>
        </form>

        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">現在の表示範囲: {rangeLabel}</p>
      </section>

      <TabbedCountCharts
        dailyRows={dailyRows}
        weeklyRows={weeklyRows}
        initialDailyView={dailyView}
        initialWeeklyView={weeklyView}
        dailyEmptyMessage={
          selectedAtcoderUserId.length === 0
            ? "ユーザーを選択してください。"
            : fetchError
              ? "ユーザーの取得に失敗しました。"
              : "日別データがありません。"
        }
        weeklyEmptyMessage={
          selectedAtcoderUserId.length === 0
            ? "ユーザーを選択してください。"
            : fetchError
              ? "ユーザーの取得に失敗しました。"
              : "週次データがありません。"
        }
      />

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">difficulty帯ごとの解答数</h2>
        {selectedAtcoderUserId.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ユーザーを選択してください。</p>
        ) : fetchError ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ユーザーの取得に失敗しました。</p>
        ) : difficultyRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">表示データがありません。</p>
        ) : (
          <div className="space-y-2">
            {difficultyRows.map((row) => (
              <div key={row.bucket} className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                <span>{row.bucket}</span>
                <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-3 rounded"
                    style={{
                      width: `${(row.count / maxDifficulty) * 100}%`,
                      backgroundColor: difficultyColorByBucket(row.bucket),
                    }}
                  />
                </div>
                <span className="text-right">{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">difficulty帯ごとの平均推定時間（分）</h2>
        {!canViewDuration ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            このグラフは自分のアカウントでログインしている場合のみ表示されます。
          </p>
        ) : durationRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">平均時間データがありません。</p>
        ) : (
          <div className="space-y-2">
            {durationRows.map((row) => (
              <div key={row.bucket} className="grid grid-cols-[120px_1fr_80px] items-center gap-3 text-sm">
                <span>{row.bucket}</span>
                <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-3 rounded bg-fuchsia-500"
                    style={{ width: `${(row.avgMin / maxDuration) * 100}%` }}
                  />
                </div>
                <span className="text-right">{row.avgMin.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
