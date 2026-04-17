"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SolveCategory =
  | "DURING_CONTEST"
  | "PRACTICE_NO_EDITORIAL"
  | "PRACTICE_WITH_EDITORIAL";

type DbWithSubmissionModel = {
  submission: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
};

function parseDurationMinutesToSec(
  value: FormDataEntryValue | null,
): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.round(n * 60);
}

function parseCategory(value: FormDataEntryValue | null): SolveCategory {
  if (value === "DURING_CONTEST") {
    return "DURING_CONTEST";
  }
  if (value === "PRACTICE_WITH_EDITORIAL") {
    return "PRACTICE_WITH_EDITORIAL";
  }
  return "PRACTICE_NO_EDITORIAL";
}

export async function updateSubmissionMeta(formData: FormData) {
  const db = prisma as unknown as DbWithSubmissionModel;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("認証が必要です。");
  }

  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string" || !submissionId) {
    throw new Error("submissionId が不正です。");
  }

  await db.submission.updateMany({
    where: {
      id: submissionId,
      userId: session.user.id,
    },
    data: {
      estimatedDurationSec: parseDurationMinutesToSec(
        formData.get("estimatedDurationMin"),
      ),
      category: parseCategory(formData.get("category")),
    },
  });

  revalidatePath("/problems");
  revalidatePath("/dashboard");
}
