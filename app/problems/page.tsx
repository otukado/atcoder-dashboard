import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { updateSubmissionMeta } from "@/app/problems/actions";
import { LastSyncCacheNotice } from "@/components/last-sync-cache-notice";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function fmtDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toLocaleString("ja-JP");
}

const categories = [
  { value: "DURING_CONTEST", label: "コンテスト中" },
  { value: "PRACTICE_NO_EDITORIAL", label: "コンテスト外（解説なし）" },
  { value: "PRACTICE_WITH_EDITORIAL", label: "コンテスト外（解説あり）" },
] as const;

const categoryColor = {
  DURING_CONTEST: "#2563eb",
  PRACTICE_NO_EDITORIAL: "#10b981",
  PRACTICE_WITH_EDITORIAL: "#f59e0b",
} as const;

type SolveCategory = "DURING_CONTEST" | "PRACTICE_NO_EDITORIAL" | "PRACTICE_WITH_EDITORIAL";

type SubmissionRow = {
  id: string;
  problemId: string;
  epochSecond: number;
  attemptsUntilFirstAc: number | null;
  estimatedDurationSec: number | null;
  category: SolveCategory;
  problem: {
    title: string | null;
    contestId: string | null;
  };
};

type DbWithSubmissionFindMany = {
  submission: {
    findMany: (args: unknown) => Promise<SubmissionRow[]>;
  };
};

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

function getTodayJstStartEpoch(): number {
  const todayText = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return dayStartEpoch(todayText) ?? Math.floor(Date.now() / 1000);
}

function toAtCoderProblemUrl(problemId: string, contestId: string | null): string | null {
  if (!contestId) {
    return null;
  }
  return `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`;
}

type ProblemsPageProps = {
  searchParams?: Promise<{
    range?: string;
    start?: string;
    end?: string;
  }>;
};

export default async function ProblemsPage({ searchParams }: ProblemsPageProps) {
  const db = prisma as unknown as DbWithSubmissionFindMany;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = (await searchParams) ?? {};
  const selectedRange = params.range ?? "30";
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

  const submissions = await db.submission.findMany({
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
      epochSecond: "desc",
    },
  });

  const categoryCounts = {
    DURING_CONTEST: 0,
    PRACTICE_NO_EDITORIAL: 0,
    PRACTICE_WITH_EDITORIAL: 0,
  };
  for (const s of submissions) {
    categoryCounts[s.category] += 1;
  }

  const maxCategoryCount = Math.max(
    1,
    categoryCounts.DURING_CONTEST,
    categoryCounts.PRACTICE_NO_EDITORIAL,
    categoryCounts.PRACTICE_WITH_EDITORIAL,
  );

  const customStartDefault = params.start ?? "";
  const customEndDefault = params.end ?? "";

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">解いた問題の3分類</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            コンテスト中 / 解説なし / 解説あり を問題単位で更新できます。
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
          ダッシュボードへ戻る
        </Link>
      </header>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">期間フィルタ</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href="/problems?range=7"
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "7"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            7日
          </Link>
          <Link
            href="/problems?range=30"
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "30"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            30日
          </Link>
          <Link
            href="/problems?range=90"
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "90"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            90日
          </Link>
          <Link
            href="/problems?range=all"
            className={`rounded-md px-3 py-1 text-sm ${
              selectedRange === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            全期間
          </Link>
        </div>

        <form action="/problems" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
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
      </section>

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">3分類ごとの件数グラフ</h2>
        <div className="space-y-2">
          {categories.map((c) => {
            const count = categoryCounts[c.value];
            return (
              <div key={c.value} className="grid grid-cols-[180px_1fr_48px] items-center gap-3 text-sm">
                <span>{c.label}</span>
                <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-3 rounded"
                    style={{
                      width: `${(count / maxCategoryCount) * 100}%`,
                      backgroundColor: categoryColor[c.value],
                    }}
                  />
                </div>
                <span className="text-right">{count}</span>
              </div>
            );
          })}
        </div>
        <LastSyncCacheNotice />
      </section>

      {submissions.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">データがありません。ダッシュボードで同期を実行してください。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <form
              key={s.id}
              action={updateSubmissionMeta}
              className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-[1.7fr_1fr_1fr_auto] md:items-end"
            >
              <div>
                {toAtCoderProblemUrl(s.problemId, s.problem.contestId) ? (
                  <a
                    href={toAtCoderProblemUrl(s.problemId, s.problem.contestId) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-blue-700 underline dark:text-blue-400"
                  >
                    {s.problem.title ?? s.problemId}
                  </a>
                ) : (
                  <p className="text-sm font-medium">{s.problem.title ?? s.problemId}</p>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {s.problemId} / {fmtDate(s.epochSecond)} / 初ACまで提出 {s.attemptsUntilFirstAc ?? "-"}
                </p>
                <input type="hidden" name="submissionId" value={s.id} />
              </div>

              <label className="text-sm">
                <span className="mb-1 block">分類</span>
                <select
                  name="category"
                  defaultValue={s.category}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block">学習時間(分)</span>
                <input
                  type="number"
                  min={1}
                  name="estimatedDurationMin"
                  defaultValue={s.estimatedDurationSec ? Math.max(1, Math.round(s.estimatedDurationSec / 60)) : ""}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                保存
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
