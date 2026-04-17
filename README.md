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
- `NEXTAUTH_SECRET`
- `GITHUB_ID`
- `GITHUB_SECRET`

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

### 3. 使い方
1. `/login` でログイン
2. `/dashboard` で AtCoder ID を保存
3. 「AtCoderデータを同期」を実行
4. `/problems` で3分類と学習時間を編集

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.
