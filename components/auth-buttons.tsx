"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";

type Props = {
  isLoggedIn: boolean;
};

export function AuthButtons({ isLoggedIn }: Props) {
  if (!isLoggedIn) {
    return (
      <button
        onClick={() => signIn("github")}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        GitHubでログイン
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/dashboard"
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        ダッシュボードへ
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        ログアウト
      </button>
    </div>
  );
}
