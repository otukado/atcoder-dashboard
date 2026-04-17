## atcoder-dashboard (web)

AtCoder の精進状況を可視化するダッシュボードです。

### 実装済み（MVP進行中）
- GitHub OAuth ログイン（Auth.js）
- ユーザーごとのデータ分離（`userId` 紐付け）
- AtCoder ID 登録
- AtCoder Problems API からの同期
- 日別AC数グラフ（棒）
- difficulty帯ごとの解答数グラフ（棒）
- 解いた問題の3分類ページ（コンテスト中 / 解説なし / 解説あり）
- 推定学習時間（秒）をUIから編集
- 初ACまでの提出数を自動記録

## Getting Started

### 1. 環境変数

`.env.example` をコピーして `.env` を作成し、GitHub OAuth を設定します。

```bash
cp .env.example .env
```

必須:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `GITHUB_ID`
- `GITHUB_SECRET`

開発時は `DATABASE_URL` / `DIRECT_URL` が未設定でも、
アプリ実行時はメモリ内DB（`pg-mem`）に自動フォールバックするため、ローカルPostgreSQLなしでデバッグできます。

GitHub OAuth App 側の設定:
- Authorization callback URL: `http://localhost:3001/api/auth/callback/github`
- `.env` の `NEXTAUTH_URL` は起動URLと同じ `http://localhost:3001` にする

> `error=github` でログイン失敗する場合は、`GITHUB_ID` / `GITHUB_SECRET` の空文字・誤設定をまず確認してください。

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

### 2. DBマイグレーション

```bash
npx prisma migrate dev
```

`DIRECT_URL` がある場合、マイグレーションは `DIRECT_URL` が優先利用されます。

### 3. 使い方
1. `/login` でログイン
2. `/dashboard` で AtCoder ID を保存
3. 「AtCoderデータを同期」を実行
4. `/problems` で3分類と学習時間を編集

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

## Vercel（Hobby）+ Neon（Free）デプロイ手順

1. Neon で無料プロジェクトを作成し、接続文字列を取得
	- `DATABASE_URL`: Neon の pooled 接続（`pgbouncer=true`）
	- `DIRECT_URL`: Neon の direct 接続（pooler なし）

2. GitHub OAuth App を本番URL対応に更新
	- Authorization callback URL: `https://<your-app>.vercel.app/api/auth/callback/github`

3. Vercel にリポジトリを Import
	- Root Directory: `web`

4. Vercel の環境変数を設定（Production/Preview）
	- `DATABASE_URL`
	- `DIRECT_URL`
	- `NEXTAUTH_URL`（例: `https://<your-app>.vercel.app`）
	- `NEXTAUTH_SECRET`
	- `GITHUB_ID`
	- `GITHUB_SECRET`

5. 初回デプロイ後にマイグレーションを適用
	- Vercel Project → Settings → Functions / Build のいずれかで、以下を実行
	- `npm run db:deploy`

6. 再デプロイして動作確認
	- `/login` で GitHub ログイン
	- `/dashboard` で AtCoder ID 登録・同期
