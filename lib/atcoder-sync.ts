import { prisma } from "@/lib/prisma";

type AtCoderSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  result: string;
};

type AtCoderProblem = {
  id: string;
  title: string;
  contest_id: string;
};

type AtCoderProblemModel = {
  id: string;
  difficulty?: number;
};

type DbWithSolveModels = {
  problem: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  submission: {
    upsert: (args: unknown) => Promise<unknown>;
  };
  userProfile: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

function normalizeDifficulty(value: number | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

export async function syncAtCoderDataForUser(
  userId: string,
  atcoderUserId: string,
) {
  const db = prisma as unknown as DbWithSolveModels;

  const [problemsRes, problemModelsRes] = await Promise.all([
    fetch("https://kenkoooo.com/atcoder/resources/merged-problems.json", {
      cache: "force-cache",
    }),
    fetch("https://kenkoooo.com/atcoder/resources/problem-models.json", {
      cache: "force-cache",
    }),
  ]);

  if (!problemsRes.ok || !problemModelsRes.ok) {
    throw new Error("AtCoder Problems APIの取得に失敗しました。");
  }

  const submissions: AtCoderSubmission[] = [];
  const seenSubmissionIds = new Set<number>();
  let fromSecond = 0;

  while (true) {
    const submissionsRes = await fetch(
      `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(
        atcoderUserId,
      )}&from_second=${fromSecond}`,
      { cache: "no-store" },
    );

    if (!submissionsRes.ok) {
      throw new Error("AtCoder提出データの取得に失敗しました。");
    }

    const batch = (await submissionsRes.json()) as AtCoderSubmission[];
    if (batch.length === 0) {
      break;
    }

    let addedCount = 0;
    for (const s of batch) {
      if (seenSubmissionIds.has(s.id)) {
        continue;
      }
      seenSubmissionIds.add(s.id);
      submissions.push(s);
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

  const problems = (await problemsRes.json()) as AtCoderProblem[];
  const problemModels = (await problemModelsRes.json()) as Record<
    string,
    AtCoderProblemModel
  >;

  const submissionsSorted = submissions
    .slice()
    .sort((a, b) => a.epoch_second - b.epoch_second);
  const attemptsMap = new Map<string, number>();
  const firstAcCountByProblem = new Map<string, number>();

  for (const s of submissionsSorted) {
    const next = (attemptsMap.get(s.problem_id) ?? 0) + 1;
    attemptsMap.set(s.problem_id, next);
    if (s.result === "AC" && !firstAcCountByProblem.has(s.problem_id)) {
      firstAcCountByProblem.set(s.problem_id, next);
    }
  }

  const records: Array<{
    userId: string;
    problemId: string;
    externalSubmissionId: string;
    epochSecond: number;
    result: string;
    contestId: string | null;
    attemptsUntilFirstAc: number | null;
    estimatedDurationSec: number | null;
    category: "PRACTICE_NO_EDITORIAL";
  }> = [];

  for (let i = 0; i < submissionsSorted.length; i++) {
    const s = submissionsSorted[i];
    if (s.result !== "AC") {
      continue;
    }

    let estimatedDurationSec: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = submissionsSorted[j];
      if (prev.problem_id === s.problem_id) {
        continue;
      }

      const diff = s.epoch_second - prev.epoch_second;
      if (diff > 0) {
        estimatedDurationSec = diff;
      }
      break;
    }

    records.push({
      userId,
      problemId: s.problem_id,
      externalSubmissionId: String(s.id),
      epochSecond: s.epoch_second,
      result: s.result,
      contestId: s.contest_id || null,
      attemptsUntilFirstAc: firstAcCountByProblem.get(s.problem_id) ?? null,
      estimatedDurationSec,
      category: "PRACTICE_NO_EDITORIAL",
    });
  }

  const problemById = new Map(problems.map((p) => [p.id, p]));
  const uniqueProblemIds = [...new Set(records.map((r) => r.problemId))];

  for (const problemId of uniqueProblemIds) {
    const p = problemById.get(problemId);
    const model = problemModels[problemId];
    await db.problem.upsert({
      where: { id: problemId },
      create: {
        id: problemId,
        title: p?.title ?? problemId,
        contestId: p?.contest_id ?? null,
        difficulty: normalizeDifficulty(model?.difficulty),
      },
      update: {
        title: p?.title ?? problemId,
        contestId: p?.contest_id ?? null,
        difficulty: normalizeDifficulty(model?.difficulty),
      },
    });
  }

  for (const rec of records) {
    await db.submission.upsert({
      where: {
        userId_externalSubmissionId: {
          userId: rec.userId,
          externalSubmissionId: rec.externalSubmissionId,
        },
      },
      create: rec,
      update: {
        problemId: rec.problemId,
        epochSecond: rec.epochSecond,
        result: rec.result,
        contestId: rec.contestId,
        attemptsUntilFirstAc: rec.attemptsUntilFirstAc,
      },
    });
  }

  const syncedAt = new Date();
  await db.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      atcoderUserId,
      lastSyncedAt: syncedAt,
    },
    update: {
      lastSyncedAt: syncedAt,
    },
  });

  return {
    fetchedSubmissions: submissions.length,
    syncedAcceptedSubmissions: records.length,
    syncedProblems: uniqueProblemIds.length,
    syncedAt: syncedAt.toISOString(),
  };
}
