import Link from "next/link";
import { getServerSession } from "next-auth";

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
  if (start === null) return "#6b7280";
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
  }>;
};

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

  const diffMap = new Map<string, number>();
  for (const s of acSubmissions) {
    const difficulty = problemModels[s.problem_id]?.difficulty;
    const normalizedDifficulty = typeof difficulty === "number" ? Math.max(0, Math.round(difficulty)) : null;
    const bucket = difficultyBucket(normalizedDifficulty);
    diffMap.set(bucket, (diffMap.get(bucket) ?? 0) + 1);
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

  const durationRows = [...durationByBucket.entries()]
    .map(([bucket, v]) => ({ bucket, avgMin: v.count > 0 ? v.sum / v.count : 0 }))
    .sort((a, b) => compareBucketsAsc(a.bucket, b.bucket));
  const maxDuration = Math.max(1, ...durationRows.map((r) => r.avgMin));

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
