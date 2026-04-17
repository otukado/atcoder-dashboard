"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { syncAtCoderDataForUser } from "@/lib/atcoder-sync";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DbWithResetModels = {
  submission: {
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  problem: {
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

function normalizeAtCoderUserId(value: string): string {
  return value.trim().toLowerCase();
}

export async function updateAtCoderUserId(formData: FormData) {
  const db = prisma as unknown as DbWithResetModels;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("認証が必要です。");
  }

  const raw = formData.get("atcoderUserId");
  const atcoderUserId =
    typeof raw === "string" ? normalizeAtCoderUserId(raw) : "";

  const currentProfile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  const currentAtCoderUserId = currentProfile?.atcoderUserId
    ? normalizeAtCoderUserId(currentProfile.atcoderUserId)
    : null;
  const nextAtCoderUserId = atcoderUserId || null;
  const changed = currentAtCoderUserId !== nextAtCoderUserId;

  if (changed) {
    await db.submission.deleteMany({
      where: {
        userId: session.user.id,
      },
    });

    await db.problem.deleteMany({
      where: {
        submissions: {
          none: {},
        },
      },
    });
  }

  await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      atcoderUserId: nextAtCoderUserId,
      lastSyncedAt: null,
    },
    update: {
      atcoderUserId: nextAtCoderUserId,
      ...(changed ? { lastSyncedAt: null } : {}),
    },
  });

  revalidatePath("/dashboard");
}

export async function syncAtCoderData() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("認証が必要です。");
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile?.atcoderUserId) {
    throw new Error("AtCoder ID を設定してください。");
  }

  await syncAtCoderDataForUser(session.user.id, profile.atcoderUserId);

  revalidatePath("/dashboard");
  revalidatePath("/problems");
}
