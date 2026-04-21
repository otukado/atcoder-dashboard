import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AtCoderUserIdForm } from "@/components/atcoder-user-id-form";
import { LastSyncCacheNotice } from "@/components/last-sync-cache-notice";
import { SyncAtCoderButton } from "@/components/sync-atcoder-button";
import { TabbedCountCharts } from "@/components/tabbed-count-charts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toDayKey(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(0, 10);
}

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
  if (start < 400) return "#6b7280"; // gray
  if (start < 800) return "#8b5a2b"; // brown
  if (start < 1200) return "#16a34a"; // green
  if (start < 1600) return "#06b6d4"; // cyan
  if (start < 2000) return "#2563eb"; // blue
  if (start < 2400) return "#ca8a04"; // yellow
  if (start < 2800) return "#ea580c"; // orange
  return "#dc2626"; // red
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

function problemLetter(problemId: string): string {
  const m = problemId.match(/_([a-z])$/i);
  if (!m) return "Others";
  return m[1].toUpperCase();
}

type SolveCategory = "DURING_CONTEST" | "PRACTICE_NO_EDITORIAL" | "PRACTICE_WITH_EDITORIAL";

type SubmissionRow = {
  id: string;
  problemId: string;
  epochSecond: number;
  attemptsUntilFirstAc: number | null;
  estimatedDurationSec: number | null;
  category: SolveCategory;
  problem: {
    difficulty: number | null;
  };
};

type DbWithSubmissionFindMany = {
  submission: {
    findMany: (args: unknown) => Promise<SubmissionRow[]>;
  };
};

type DashboardPageProps = {
  searchParams?: Promise<{
    range?: string;
    start?: string;
    end?: string;
    dailyCategory?: string;
    dailyView?: string;
    weeklyView?: string;
  }>;
};

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

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const db = prisma as unknown as DbWithSubmissionFindMany;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = (await searchParams) ?? {};
  const selectedRange = params.range ?? "30";
  const dailyCategoryFilter: "all" | SolveCategory =
    params.dailyCategory === "DURING_CONTEST" ||
    params.dailyCategory === "PRACTICE_NO_EDITORIAL" ||
    params.dailyCategory === "PRACTICE_WITH_EDITORIAL"
      ? params.dailyCategory
      : "all";

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

  const [profile, submissions] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    }),
    db.submission.findMany({
      where: {
        userId: session.user.id,
        result: "AC",
        ...(startEpoch !== undefined || endEpoch !== undefined
          ? {
              epochSecond: {
                ...(startEpoch !== undefined ? { gte: startEpoch } : {}),
                ...(endEpoch !== undefined ? { lte: endEpoch } : {}),
              },
            }
          : {}),
      },
      include: {
        problem: true,
      },
      orderBy: {
        epochSecond: "asc",
      },
    }),
  ]);

  const dailyTargetSubmissions =
    dailyCategoryFilter === "all"
      ? submissions
      : submissions.filter((s) => s.category === dailyCategoryFilter);

  const dailyMap = new Map<string, number>();
  const dailyDifficultyMap = new Map<string, Map<string, number>>();
  const dailyLetterMap = new Map<string, Map<string, number>>();
  const diffMap = new Map<string, number>();
  const weeklyMap = new Map<string, number>();
  const weeklyDifficultyMap = new Map<string, Map<string, number>>();
  const weeklyLetterMap = new Map<string, Map<string, number>>();
  const letterMap = new Map<string, number>();

  for (const s of dailyTargetSubmissions) {
    const day = toDayKey(s.epochSecond);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);

    const bucket = difficultyBucket(s.problem.difficulty);
    const bucketCounts = dailyDifficultyMap.get(day) ?? new Map<string, number>();
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    dailyDifficultyMap.set(day, bucketCounts);

    const letter = problemLetter(s.problemId);
    const letterCounts = dailyLetterMap.get(day) ?? new Map<string, number>();
    letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1);
    dailyLetterMap.set(day, letterCounts);

    const week = weekKeyJst(s.epochSecond);
    weeklyMap.set(week, (weeklyMap.get(week) ?? 0) + 1);

    const weeklyBucketCounts = weeklyDifficultyMap.get(week) ?? new Map<string, number>();
    weeklyBucketCounts.set(bucket, (weeklyBucketCounts.get(bucket) ?? 0) + 1);
    weeklyDifficultyMap.set(week, weeklyBucketCounts);

    const weeklyLetterCounts = weeklyLetterMap.get(week) ?? new Map<string, number>();
    weeklyLetterCounts.set(letter, (weeklyLetterCounts.get(letter) ?? 0) + 1);
    weeklyLetterMap.set(week, weeklyLetterCounts);
  }

  for (const s of submissions) {
    const bucket = difficultyBucket(s.problem.difficulty);
    diffMap.set(bucket, (diffMap.get(bucket) ?? 0) + 1);
    const letter = problemLetter(s.problemId);
    letterMap.set(letter, (letterMap.get(letter) ?? 0) + 1);
  }

  const letterOrder = ["A", "B", "C", "D", "E", "F", "G", "H", "Others"];

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

  const difficultyRows = [...diffMap.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => compareBucketsAsc(a.bucket, b.bucket));

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

  const letterRows = letterOrder
    .map((label) => ({ label, count: letterMap.get(label) ?? 0 }))
    .filter((row) => row.count > 0);

  const noEditorialTimedSubmissions = submissions.filter(
    (s) => s.category === "PRACTICE_NO_EDITORIAL" && (s.estimatedDurationSec ?? 0) > 0,
  );

  const lineSeriesMap = new Map<string, Array<{ epochSecond: number; durationMin: number }>>();
  for (const s of noEditorialTimedSubmissions) {
    const bucket = difficultyBucket(s.problem.difficulty);
    const points = lineSeriesMap.get(bucket) ?? [];
    points.push({
      epochSecond: s.epochSecond,
      durationMin: Math.max(1, Math.round((s.estimatedDurationSec ?? 0) / 60)),
    });
    lineSeriesMap.set(bucket, points);
  }

  const movingAverageWindow = 5;
  const lineSeries = [...lineSeriesMap.entries()]
    .map(([bucket, points]) => {
      const sortedPoints = points.sort((a, b) => a.epochSecond - b.epochSecond);
      const averagedPoints = sortedPoints.map((p, idx) => {
        const startIndex = Math.max(0, idx - movingAverageWindow + 1);
        const windowPoints = sortedPoints.slice(startIndex, idx + 1);
        const avgDuration = windowPoints.reduce((acc, v) => acc + v.durationMin, 0) / windowPoints.length;

        return {
          ...p,
          movingAvgMin: avgDuration,
        };
      });

      return {
        bucket,
        color: difficultyColorByBucket(bucket),
        points: averagedPoints,
      };
    })
    .sort((a, b) => compareBucketsAsc(a.bucket, b.bucket));

  const lineAllPoints = lineSeries.flatMap((s) => s.points);
  const lineMinEpoch = lineAllPoints.length > 0 ? Math.min(...lineAllPoints.map((p) => p.epochSecond)) : 0;
  const lineMaxEpoch = lineAllPoints.length > 0 ? Math.max(...lineAllPoints.map((p) => p.epochSecond)) : 1;
  const lineMaxDuration = lineAllPoints.length > 0 ? Math.max(...lineAllPoints.map((p) => p.movingAvgMin)) : 1;
  const lineWidth = 860;
  const lineHeight = 280;
  const linePadLeft = 40;
  const linePadRight = 20;
  const linePadTop = 16;
  const linePadBottom = 28;

  const linePathByBucket = lineSeries.map((series) => {
    const pointsText = series.points
      .map((p) => {
        const xRatio = lineMaxEpoch === lineMinEpoch ? 0 : (p.epochSecond - lineMinEpoch) / (lineMaxEpoch - lineMinEpoch);
        const yRatio = lineMaxDuration <= 0 ? 0 : p.movingAvgMin / lineMaxDuration;
        const x = linePadLeft + xRatio * (lineWidth - linePadLeft - linePadRight);
        const y = lineHeight - linePadBottom - yRatio * (lineHeight - linePadTop - linePadBottom);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return {
      bucket: series.bucket,
      color: series.color,
      pointsText,
    };
  });

  const totalDifficultyCount = difficultyRows.reduce((acc, row) => acc + row.count, 0);
  const difficultyRatioRows =
    totalDifficultyCount > 0
      ? difficultyRows.map((row, index) => ({
          ...row,
          ratio: row.count / totalDifficultyCount,
          color: difficultyColorByBucket(row.bucket),
          index,
        }))
      : [];

  const pieBackground =
    difficultyRatioRows.length === 0
      ? "#e5e7eb"
      : `conic-gradient(${difficultyRatioRows
          .map((row, index, arr) => {
            const start = arr.slice(0, index).reduce((acc, cur) => acc + cur.ratio, 0) * 100;
            const end = start + row.ratio * 100;
            return `${row.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
          })
          .join(", ")})`;

  const maxDifficulty = Math.max(1, ...difficultyRows.map((r) => r.count));
  const maxLetter = Math.max(1, ...letterRows.map((r) => r.count));

  const totalDurationMin = submissions.reduce<number>(
    (acc: number, s: SubmissionRow) => acc + Math.round((s.estimatedDurationSec ?? 0) / 60),
    0,
  );
  const firstAcAttemptAvg =
    submissions.length > 0
      ? submissions.reduce<number>((acc: number, s: SubmissionRow) => acc + (s.attemptsUntilFirstAc ?? 0), 0) /
        submissions.length
      : 0;

  const rangeLabel =
    startEpoch !== undefined && endEpoch !== undefined
      ? `${formatDate(startEpoch)} 〜 ${formatDate(endEpoch)}`
      : "全期間";

  const customStartDefault = params.start ?? "";
  const customEndDefault = params.end ?? "";
  const lastSyncedText = profile?.lastSyncedAt
    ? new Date(profile.lastSyncedAt).toLocaleString("ja-JP")
    : "未同期";

  const buildDashboardHref = (overrides: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    search.set("range", selectedRange);

    if (params.start) search.set("start", params.start);
    if (params.end) search.set("end", params.end);

    search.set("dailyCategory", dailyCategoryFilter);
    search.set("dailyView", dailyView);
    search.set("weeklyView", weeklyView);

    for (const [key, value] of Object.entries(overrides)) {
      if (!value) {
        search.delete(key);
      } else {
        search.set(key, value);
      }
    }

    return `/dashboard?${search.toString()}`;
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ダッシュボード</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ログインユーザー専用データを表示しています。</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/problems" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            3分類ページ
          </Link>
          <Link href="/explore" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            他ユーザーを見る
          </Link>
          <Link href="/" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            トップへ戻る
          </Link>
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">期間フィルタ</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={buildDashboardHref({ range: "7" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "7"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            7日
          </Link>
          <Link
            href={buildDashboardHref({ range: "30" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "30"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            30日
          </Link>
          <Link
            href={buildDashboardHref({ range: "90" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "90"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            90日
          </Link>
          <Link
            href={buildDashboardHref({ range: "all" })}
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            全期間
          </Link>
        </div>

        <form action="/dashboard" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="dailyCategory" value={dailyCategoryFilter} />
          <input type="hidden" name="dailyView" value={dailyView} />
          <input type="hidden" name="weeklyView" value={weeklyView} />
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

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold">アカウント情報</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">GitHub名: {session.user.name ?? "未設定"}</p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">メール: {session.user.email ?? "未設定"}</p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">内部 userId: {session.user.id}</p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold">AtCoder ID 設定</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
          他ユーザーのデータとは分離され、あなたの `userId` にのみ紐づきます。
        </p>
        {profile?.atcoderUserId ? (
          <p className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            設定済み: {profile.atcoderUserId}
          </p>
        ) : (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            未設定: AtCoder ID を保存すると同期できます。
          </p>
        )}

        <AtCoderUserIdForm currentAtCoderUserId={profile?.atcoderUserId} />

        <SyncAtCoderButton />
        <LastSyncCacheNotice />
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">最終同期: {lastSyncedText}</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">AC件数</p>
          <p className="text-2xl font-bold">{submissions.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">推定学習時間</p>
          <p className="text-2xl font-bold">{totalDurationMin} 分</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">初ACまで提出数（平均）</p>
          <p className="text-2xl font-bold">{firstAcAttemptAvg.toFixed(2)}</p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">日別の解いた問題数（分類フィルタ）</h2>
        <div className="mb-1 flex flex-wrap gap-2 text-sm">
          <Link
            href={buildDashboardHref({ dailyCategory: "all" })}
            className={`rounded-md px-3 py-1 ${
              dailyCategoryFilter === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            全分類
          </Link>
          <Link
            href={buildDashboardHref({ dailyCategory: "DURING_CONTEST" })}
            className={`rounded-md px-3 py-1 ${
              dailyCategoryFilter === "DURING_CONTEST"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            コンテスト中
          </Link>
          <Link
            href={buildDashboardHref({ dailyCategory: "PRACTICE_NO_EDITORIAL" })}
            className={`rounded-md px-3 py-1 ${
              dailyCategoryFilter === "PRACTICE_NO_EDITORIAL"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            解説なし
          </Link>
          <Link
            href={buildDashboardHref({ dailyCategory: "PRACTICE_WITH_EDITORIAL" })}
            className={`rounded-md px-3 py-1 ${
              dailyCategoryFilter === "PRACTICE_WITH_EDITORIAL"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            解説あり
          </Link>
        </div>
      </section>

      <TabbedCountCharts
        dailyRows={dailyRows}
        weeklyRows={weeklyRows}
        initialDailyView={dailyView}
        initialWeeklyView={weeklyView}
        dailyEmptyMessage="まだデータがありません。同期を実行してください。"
        weeklyEmptyMessage="週次データがありません。"
      />

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">A/B問題などの分類グラフ</h2>
        {letterRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">問題分類データがありません。</p>
        ) : (
          <div className="space-y-2">
            {letterRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[80px_1fr_40px] items-center gap-3 text-sm">
                <span>{row.label}</span>
                <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-3 rounded bg-cyan-500" style={{ width: `${(row.count / maxLetter) * 100}%` }} />
                </div>
                <span className="text-right">{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">ACまでの時間変化（解説なし / difficulty別）</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
          直近 {movingAverageWindow} 問の移動平均で描画しています。点にホバーすると詳細を表示します。
        </p>
        {lineSeries.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">折れ線グラフに必要なデータがありません。</p>
        ) : (
          <div>
            <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="w-full rounded border border-zinc-200 dark:border-zinc-700">
              <line x1={linePadLeft} y1={lineHeight - linePadBottom} x2={lineWidth - linePadRight} y2={lineHeight - linePadBottom} stroke="#94a3b8" strokeWidth="1" />
              <line x1={linePadLeft} y1={linePadTop} x2={linePadLeft} y2={lineHeight - linePadBottom} stroke="#94a3b8" strokeWidth="1" />
              {linePathByBucket.map((series) => (
                <polyline
                  key={series.bucket}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="2"
                  points={series.pointsText}
                />
              ))}
              {lineSeries.flatMap((series) =>
                series.points.map((point, idx) => {
                  const xRatio =
                    lineMaxEpoch === lineMinEpoch ? 0 : (point.epochSecond - lineMinEpoch) / (lineMaxEpoch - lineMinEpoch);
                  const yRatio = lineMaxDuration <= 0 ? 0 : point.movingAvgMin / lineMaxDuration;
                  const x = linePadLeft + xRatio * (lineWidth - linePadLeft - linePadRight);
                  const y = lineHeight - linePadBottom - yRatio * (lineHeight - linePadTop - linePadBottom);

                  return (
                    <circle key={`${series.bucket}-${idx}`} cx={x} cy={y} r={3} fill={series.color}>
                      <title>
                        {`${series.bucket} / ${formatDate(point.epochSecond)} / 移動平均: ${point.movingAvgMin.toFixed(1)}分 / 実測: ${point.durationMin.toFixed(1)}分`}
                      </title>
                    </circle>
                  );
                }),
              )}
            </svg>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-300">
              {lineSeries.map((series) => (
                <span key={series.bucket} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
                  {series.bucket}
                </span>
              ))}
              <span className="ml-auto">最小日付: {formatDate(lineMinEpoch)} / 最大日付: {formatDate(lineMaxEpoch)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">difficulty帯ごとの解答数</h2>
        {difficultyRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">difficultyデータがまだありません。</p>
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

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">difficulty帯ごとの解答比率（円グラフ）</h2>
        {difficultyRatioRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">比率を計算できるdifficultyデータがまだありません。</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
            <div className="mx-auto">
              <div
                className="h-44 w-44 rounded-full border border-zinc-200 dark:border-zinc-700"
                style={{ background: pieBackground }}
                aria-label="difficulty帯ごとの解答比率円グラフ"
              />
            </div>
            <ul className="space-y-2 text-sm">
              {difficultyRatioRows.map((row) => (
                <li key={row.bucket} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: row.color }}
                      aria-hidden
                    />
                    <span>{row.bucket}</span>
                  </div>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    {row.count}件 / {(row.ratio * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
