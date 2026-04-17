import LoginWithGithubButton from "@/app/login/signin-button";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const errorRaw = resolvedSearchParams.error;
  const error = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;

  const errorText =
    error === "github"
      ? "GitHub OAuth の設定エラーです。GITHUB_ID / GITHUB_SECRET、または GitHub OAuth App の callback URL を確認してください。"
      : error
        ? `ログインに失敗しました（${error}）。設定とネットワークを確認して再試行してください。`
        : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-10">
      <div className="w-full rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-2 text-2xl font-bold">ログイン</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-300">
          ユーザーごとのデータ分離のため、GitHubアカウントでサインインしてください。
        </p>

        {errorText ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" role="alert">
            <p className="font-medium">ログインエラー</p>
            <p className="mt-1">{errorText}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>.env の `GITHUB_ID` / `GITHUB_SECRET` が空でないこと</li>
              <li>GitHub OAuth App の Authorization callback URL が `http://localhost:3001/api/auth/callback/github` であること</li>
              <li>.env の `NEXTAUTH_URL` が実際の起動URLと一致していること</li>
            </ul>
          </div>
        ) : null}

        <LoginWithGithubButton />
      </div>
    </div>
  );
}
