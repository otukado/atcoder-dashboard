"use client";

import { useState } from "react";

import { updateSubmissionMeta } from "@/app/problems/actions";

type SolveCategory =
  | "DURING_CONTEST"
  | "PRACTICE_NO_EDITORIAL"
  | "PRACTICE_WITH_EDITORIAL";

type SubmissionMetaFormProps = {
  submissionId: string;
  title: string | null;
  problemId: string;
  contestId: string | null;
  epochSecond: number;
  attemptsUntilFirstAc: number | null;
  initialCategory: SolveCategory;
  initialEstimatedDurationMin: string;
};

function fmtDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toLocaleString("ja-JP");
}

function toAtCoderProblemUrl(problemId: string, contestId: string | null): string | null {
  if (!contestId) {
    return null;
  }
  return `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`;
}

const categories = [
  { value: "DURING_CONTEST", label: "コンテスト中" },
  { value: "PRACTICE_NO_EDITORIAL", label: "コンテスト外（解説なし）" },
  { value: "PRACTICE_WITH_EDITORIAL", label: "コンテスト外（解説あり）" },
] as const;

export function SubmissionMetaForm({
  submissionId,
  title,
  problemId,
  contestId,
  epochSecond,
  attemptsUntilFirstAc,
  initialCategory,
  initialEstimatedDurationMin,
}: SubmissionMetaFormProps) {
  const [category, setCategory] = useState<SolveCategory>(initialCategory);
  const [estimatedDurationMin, setEstimatedDurationMin] = useState(initialEstimatedDurationMin);

  const href = toAtCoderProblemUrl(problemId, contestId);

  return (
    <form
      action={updateSubmissionMeta}
      className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-[1.7fr_1fr_1fr_auto] md:items-end"
    >
      <div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-blue-700 underline dark:text-blue-400"
          >
            {title ?? problemId}
          </a>
        ) : (
          <p className="text-sm font-medium">{title ?? problemId}</p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {problemId} / {fmtDate(epochSecond)} / 初ACまで提出 {attemptsUntilFirstAc ?? "-"}
        </p>
        <input type="hidden" name="submissionId" value={submissionId} />
      </div>

      <label className="text-sm">
        <span className="mb-1 block">分類</span>
        <select
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value as SolveCategory)}
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
          value={estimatedDurationMin}
          onChange={(event) => setEstimatedDurationMin(event.target.value)}
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
  );
}