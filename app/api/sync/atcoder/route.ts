import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { syncAtCoderDataForUser } from "@/lib/atcoder-sync";
import { prisma } from "@/lib/prisma";
import { clearSyncProgress, getSyncProgress, setSyncProgress } from "@/lib/sync-progress";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "認証が必要です。" }, { status: 401 });
  }

  const progress = getSyncProgress(session.user.id);
  return NextResponse.json({ progress });
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "認証が必要です。" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!profile?.atcoderUserId) {
      return NextResponse.json(
        { message: "AtCoder ID を設定してください。" },
        { status: 400 },
      );
    }

    setSyncProgress(session.user.id, {
      phase: "fetching",
      fetchedSubmissions: 0,
      totalProblems: 0,
      savedProblems: 0,
      totalSubmissions: 0,
      savedSubmissions: 0,
      message: "同期を開始しました。",
    });

    const result = await syncAtCoderDataForUser(
      session.user.id,
      profile.atcoderUserId,
      (p) => {
        setSyncProgress(session.user.id, {
          phase: p.phase,
          fetchedSubmissions: p.fetchedSubmissions ?? 0,
          totalProblems: p.totalProblems ?? 0,
          savedProblems: p.savedProblems ?? 0,
          totalSubmissions: p.totalSubmissions ?? 0,
          savedSubmissions: p.savedSubmissions ?? 0,
          message: p.message ?? "同期中...",
        });
      },
    );

    setSyncProgress(session.user.id, {
      phase: "done",
      fetchedSubmissions: result.fetchedSubmissions,
      totalProblems: result.syncedProblems,
      savedProblems: result.syncedProblems,
      totalSubmissions: result.syncedAcceptedSubmissions,
      savedSubmissions: result.syncedAcceptedSubmissions,
      message: "同期が完了しました。",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "同期に失敗しました。";
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      setSyncProgress(session.user.id, {
        phase: "error",
        fetchedSubmissions: 0,
        totalProblems: 0,
        savedProblems: 0,
        totalSubmissions: 0,
        savedSubmissions: 0,
        message,
      });

      setTimeout(() => {
        clearSyncProgress(session.user.id);
      }, 10_000);
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
