import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { syncAtCoderDataForUser } from "@/lib/atcoder-sync";
import { prisma } from "@/lib/prisma";

export async function POST() {
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

  const result = await syncAtCoderDataForUser(
    session.user.id,
    profile.atcoderUserId,
  );
  return NextResponse.json(result);
}
