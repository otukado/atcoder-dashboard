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
    findFirst: (args: unknown) => Promise<{ epochSecond: number } | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    create: (args: unknown) => Promise<unknown>;
  };
  userProfile: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (
      args: unknown,
    ) => Promise<{ atcoderUserId: string | null } | null>;
  };
};

type ProblemResources = {
  problemById: Map<string, AtCoderProblem>;
  problemModels: Record<string, AtCoderProblemModel>;
};

type GlobalWithAtcoderSyncCache = typeof globalThis & {
  __atcoderProblemResourcesCache?: {
    value?: ProblemResources;
    fetchedAt?: number;
    pending?: Promise<ProblemResources>;
  };
  __atcoderUserSyncLock?: Set<string>;
};

const PROBLEM_RESOURCES_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function normalizeAtCoderUserId(value: string): string {
  return value.trim().toLowerCase();
}

function getSyncLockSet(): Set<string> {
  const g = globalThis as GlobalWithAtcoderSyncCache;
  if (!g.__atcoderUserSyncLock) {
    g.__atcoderUserSyncLock = new Set<string>();
  }
  return g.__atcoderUserSyncLock;
}

export async function waitForSyncLockRelease(userId: string): Promise<void> {
  const syncLocks = getSyncLockSet();
  while (syncLocks.has(userId)) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function loadProblemResources(): Promise<ProblemResources> {
  const g = globalThis as GlobalWithAtcoderSyncCache;
  const now = Date.now();

  if (
    g.__atcoderProblemResourcesCache?.value &&
    g.__atcoderProblemResourcesCache.fetchedAt &&
    now - g.__atcoderProblemResourcesCache.fetchedAt <
      PROBLEM_RESOURCES_CACHE_TTL_MS
  ) {
    return g.__atcoderProblemResourcesCache.value;
  }

  if (g.__atcoderProblemResourcesCache?.pending) {
    return g.__atcoderProblemResourcesCache.pending;
  }

  const pending = (async () => {
    const [problemsRes, problemModelsRes] = await Promise.all([
      fetch("https://kenkoooo.com/atcoder/resources/merged-problems.json", {
        cache: "no-store",
      }),
      fetch("https://kenkoooo.com/atcoder/resources/problem-models.json", {
        cache: "no-store",
      }),
    ]);

    if (!problemsRes.ok || !problemModelsRes.ok) {
      throw new Error("AtCoder Problems APIの取得に失敗しました。");
    }

    const problems = (await problemsRes.json()) as AtCoderProblem[];
    const problemModels = (await problemModelsRes.json()) as Record<
      string,
      AtCoderProblemModel
    >;

    return {
      problemById: new Map(problems.map((p) => [p.id, p])),
      problemModels,
    };
  })();

  g.__atcoderProblemResourcesCache = {
    ...(g.__atcoderProblemResourcesCache ?? {}),
    pending,
  };

  try {
    const value = await pending;
    g.__atcoderProblemResourcesCache = {
      value,
      fetchedAt: Date.now(),
    };
    return value;
  } catch (error) {
    g.__atcoderProblemResourcesCache = {
      ...(g.__atcoderProblemResourcesCache ?? {}),
      pending: undefined,
    };
    throw error;
  }
}

function normalizeDifficulty(value: number | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

function isUnknownArgumentError(error: unknown, argumentName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(`Unknown argument \`${argumentName}\``);
}

function isOnConflictConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(
    "there is no unique or exclusion constraint matching the ON CONFLICT specification",
  );
}

export async function syncAtCoderDataForUser(
  userId: string,
  atcoderUserId: string,
  onProgress?: (progress: {
    phase: "fetching" | "saving-problems" | "saving-submissions" | "done";
    fetchedSubmissions?: number;
    totalProblems?: number;
    savedProblems?: number;
    totalSubmissions?: number;
    savedSubmissions?: number;
    message?: string;
  }) => void,
) {
  const db = prisma as unknown as DbWithSolveModels;
  const normalizedAtCoderUserId = normalizeAtCoderUserId(atcoderUserId);

  const syncLocks = getSyncLockSet();
  await waitForSyncLockRelease(userId);
  syncLocks.add(userId);

  try {
    const latestSubmission = await db.submission.findFirst({
      where: {
        userId,
        result: "AC",
      },
      select: {
        epochSecond: true,
      },
      orderBy: {
        epochSecond: "desc",
      },
    });

    const syncStartEpoch = latestSubmission?.epochSecond ?? 0;

    const { problemById, problemModels } = await loadProblemResources();

    const submissions: AtCoderSubmission[] = [];
    const seenSubmissionIds = new Set<number>();
    let fromSecond = syncStartEpoch;

    while (true) {
      const submissionsRes = await fetch(
        `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(
          normalizedAtCoderUserId,
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

        if (syncStartEpoch > 0 && s.epoch_second < syncStartEpoch) {
          continue;
        }

        submissions.push(s);
        addedCount += 1;
      }

      onProgress?.({
        phase: "fetching",
        fetchedSubmissions: submissions.length,
        message: `提出データを取得中: ${submissions.length} 件`,
      });

      if (addedCount === 0 && batch.length < 500) {
        break;
      }

      const lastEpoch = batch[batch.length - 1]?.epoch_second;
      if (typeof lastEpoch !== "number") {
        break;
      }

      fromSecond = lastEpoch + 1;

      if (batch.length < 500) {
        break;
      }
    }

    const submissionsSorted = submissions
      .slice()
      .sort((a, b) => a.epoch_second - b.epoch_second);

    const fullSync = syncStartEpoch === 0;
    const attemptsMap = new Map<string, number>();
    const firstAcCountByProblem = new Map<string, number>();

    if (fullSync) {
      for (const s of submissionsSorted) {
        const next = (attemptsMap.get(s.problem_id) ?? 0) + 1;
        attemptsMap.set(s.problem_id, next);
        if (s.result === "AC" && !firstAcCountByProblem.has(s.problem_id)) {
          firstAcCountByProblem.set(s.problem_id, next);
        }
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
      if (fullSync) {
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
      }

      records.push({
        userId,
        problemId: s.problem_id,
        externalSubmissionId: String(s.id),
        epochSecond: s.epoch_second,
        result: s.result,
        contestId: s.contest_id || null,
        attemptsUntilFirstAc: fullSync
          ? (firstAcCountByProblem.get(s.problem_id) ?? null)
          : null,
        estimatedDurationSec,
        category: "PRACTICE_NO_EDITORIAL",
      });
    }

    const liveProfile = await db.userProfile.findUnique({
      where: { userId },
      select: { atcoderUserId: true },
    });
    const liveAtCoderUserId = normalizeAtCoderUserId(
      liveProfile?.atcoderUserId ?? "",
    );
    if (liveAtCoderUserId !== normalizedAtCoderUserId) {
      throw new Error(
        "同期中にAtCoder IDが変更されたため中断しました。再度同期してください。",
      );
    }

    const uniqueProblemIds = [...new Set(records.map((r) => r.problemId))];

    const syncedAt = new Date();

    onProgress?.({
      phase: "saving-problems",
      fetchedSubmissions: submissions.length,
      totalProblems: uniqueProblemIds.length,
      savedProblems: 0,
      totalSubmissions: records.length,
      savedSubmissions: 0,
      message: `問題データを保存中: 0 / ${uniqueProblemIds.length}`,
    });

    for (let i = 0; i < uniqueProblemIds.length; i++) {
      const problemId = uniqueProblemIds[i];
      const p = problemById.get(problemId);
      const model = problemModels[problemId];
      try {
        await db.problem.upsert({
          where: {
            userId_id: {
              userId,
              id: problemId,
            },
          },
          create: {
            userId,
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
      } catch (error) {
        if (
          !isUnknownArgumentError(error, "userId_id") &&
          !isOnConflictConstraintError(error)
        ) {
          throw error;
        }

        await db.problem.upsert({
          where: {
            id: problemId,
          },
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

      if (i === uniqueProblemIds.length - 1 || (i + 1) % 25 === 0) {
        onProgress?.({
          phase: "saving-problems",
          fetchedSubmissions: submissions.length,
          totalProblems: uniqueProblemIds.length,
          savedProblems: i + 1,
          totalSubmissions: records.length,
          savedSubmissions: 0,
          message: `問題データを保存中: ${i + 1} / ${uniqueProblemIds.length}`,
        });
      }
    }

    onProgress?.({
      phase: "saving-submissions",
      fetchedSubmissions: submissions.length,
      totalProblems: uniqueProblemIds.length,
      savedProblems: uniqueProblemIds.length,
      totalSubmissions: records.length,
      savedSubmissions: 0,
      message: `提出データを保存中: 0 / ${records.length}`,
    });

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      try {
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
      } catch (error) {
        if (
          !isUnknownArgumentError(error, "userId_externalSubmissionId") &&
          !isOnConflictConstraintError(error)
        ) {
          throw error;
        }

        const updated = await db.submission.updateMany({
          where: {
            userId: rec.userId,
            externalSubmissionId: rec.externalSubmissionId,
          },
          data: {
            problemId: rec.problemId,
            epochSecond: rec.epochSecond,
            result: rec.result,
            contestId: rec.contestId,
            attemptsUntilFirstAc: rec.attemptsUntilFirstAc,
          },
        });

        if (updated.count === 0) {
          await db.submission.create({
            data: rec,
          });
        }
      }

      if (i === records.length - 1 || (i + 1) % 50 === 0) {
        onProgress?.({
          phase: "saving-submissions",
          fetchedSubmissions: submissions.length,
          totalProblems: uniqueProblemIds.length,
          savedProblems: uniqueProblemIds.length,
          totalSubmissions: records.length,
          savedSubmissions: i + 1,
          message: `提出データを保存中: ${i + 1} / ${records.length}`,
        });
      }
    }

    await db.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        atcoderUserId: normalizedAtCoderUserId,
        lastSyncedAt: syncedAt,
      },
      update: {
        lastSyncedAt: syncedAt,
      },
    });

    onProgress?.({
      phase: "done",
      fetchedSubmissions: submissions.length,
      totalProblems: uniqueProblemIds.length,
      savedProblems: uniqueProblemIds.length,
      totalSubmissions: records.length,
      savedSubmissions: records.length,
      message: "同期完了",
    });

    return {
      fetchedSubmissions: submissions.length,
      syncedAcceptedSubmissions: records.length,
      syncedProblems: uniqueProblemIds.length,
      syncedAt: syncedAt.toISOString(),
    };
  } finally {
    syncLocks.delete(userId);
  }
}
