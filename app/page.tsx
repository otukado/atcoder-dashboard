import Link from "next/link";
import { getServerSession } from "next-auth";

import { AuthButtons } from "@/components/auth-buttons";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold">atcoder-dashboard</h1>
        <AuthButtons isLoggedIn={Boolean(session)} />
      </header>

      <main className="grid gap-8 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-xl font-semibold">目的</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            AtCoder の精進を、日別件数・難易度分布・学習時間で可視化します。
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-xl font-semibold">このMVPでできること</h2>
          <ul className="list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
            <li>GitHubログイン</li>
            <li>ユーザー単位のデータ分離</li>
            <li>AtCoder IDの登録導線</li>
          </ul>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">次のステップ</h2>
          <p className="mb-4 text-zinc-700 dark:text-zinc-300">
            まずログインし、ダッシュボードから AtCoder ID を設定してください。
          </p>
          <Link
            href="/dashboard"
            className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            ダッシュボードを開く
          </Link>
        </section>
      </main>
    </div>
  );
}
