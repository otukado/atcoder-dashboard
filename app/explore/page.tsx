import Link from "next/link";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

type AtCoderSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  result: string;
};

type AtCoderProblemModel = {
  difficulty?: number;
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
    q?: string;
  }>;
};

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const session = await getServerSession(authOptions);

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().toLowerCase();

  const submissions: AtCoderSubmission[] = [];
  let problemModels: Record<string, AtCoderProblemModel> = {};
  let fetchError: string | null = null;

  if (query) {
    try {
      const modelRes = await fetch("https://kenkoooo.com/atcoder/resources/problem-models.json", {
        cache: "force-cache",
      });

      if (!modelRes.ok) {
        throw new Error("difficulty情報の取得に失敗しました。");
      }

      problemModels = (await modelRes.json()) as Record<string, AtCoderProblemModel>;

      const seen = new Set<number>();
      let fromSecond = 0;

      while (true) {
        const submissionsRes = await fetch(
          `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(query)}&from_second=${fromSecond}`,
          { cache: "no-store" },
        );

        if (!submissionsRes.ok) {
          throw new Error("提出データの取得に失敗しました。ユーザー名を確認してください。");
        }

        const batch = (await submissionsRes.json()) as AtCoderSubmission[];
        if (batch.length === 0) break;

        let added = 0;
        for (const s of batch) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          submissions.push(s);
          added += 1;
        }

        if (added === 0) break;

        const lastEpoch = batch[batch.length - 1]?.epoch_second;
        if (typeof lastEpoch !== "number") break;
        fromSecond = lastEpoch;

        if (batch.length < 500) break;
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "データ取得に失敗しました。";
    }
  }

  const diffMap = new Map<string, number>();
  for (const s of submissions) {
    if (s.result !== "AC") continue;
    const bucket = difficultyBucket(problemModels[s.problem_id]?.difficulty ?? null);
    diffMap.set(bucket, (diffMap.get(bucket) ?? 0) + 1);
  }

  const difficultyRows = [...diffMap.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => compareBucketsAsc(a.bucket, b.bucket));
  const maxDifficulty = Math.max(1, ...difficultyRows.map((r) => r.count));

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">他ユーザーのグラフ</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            このサービス未登録の AtCoder ユーザーでも、ユーザー名だけで閲覧できます。
          </p>
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
              name="q"
              defaultValue={query}
              placeholder="例: tourist"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            閲覧
          </button>
        </form>

        {query ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">表示中ユーザー: {query}</p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ユーザー名を入力して閲覧してください。</p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">difficulty帯ごとの解答数</h2>
        {fetchError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
        ) : !query ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ユーザーを選択してください。</p>
        ) : difficultyRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">ACデータがありません。</p>
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
    </div>
  );
}
