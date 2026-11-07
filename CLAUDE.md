# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

学習用の模擬案件(納期・予算は無関係)。Shopify売上CSVをアップロードし、3大KPI(売上/粗利/リピート率)、カテゴリ別・SKUトップ10グラフ、AIコンサルコメント(サマリー+翌月アクション提案)を表示する売上分析ダッシュボードのMVP。閲覧者は社長・マーケ部長・営業5名、アップロードはマーケ担当。UIは日本語、ブランドは白+ネイビー(`#1A2E5C`)。

構成: Next.js(Vercel) + Supabase(DB/Auth) + Claude API(分析コメント) + GitHub Actions(型チェック+Lint+ビルド)。

実装計画は `C:\Users\irunt\.claude\plans\graceful-tinkering-popcorn.md`(機能1〜11の順序)。**機能は1つずつ実装し、各機能の完了ごとにユーザー確認を取ってから次へ進む。** 現在は機能1〜10まで実装済み(機能11「仕上げ」の一部とコードレビューを実施)。未検証: 実際のClaude API呼び出し(APIキー未設定のため)、Vercel/GitHub連携。

## ユーザーとのやり取りのルール

- **学習用の模擬案件のため、機能を1つ実装するたびに初心者にもわかりやすい解説を必ず付ける。** 内容は次の3点:
  1. 何の機能を実装したのか
  2. なぜその機能が必要なのか(業務上・システム上の理由)
  3. 技術選定の解説(なぜその技術・ライブラリ・設計を選んだか。代替案との違いも簡単に)
  専門用語は噛み砕き、必要ならたとえ話を使う。
- **「スクショ見て」と言われたら、クリップボードの画像を保存して読む。** PowerShellで `System.Windows.Forms.Clipboard::GetImage()` を使い、スクラッチパッド等にPNG保存してから Read ツールで開く。クリップボードに画像がなければその旨を伝える。

## コマンド

```bash
npm run dev         # 開発サーバー (http://localhost:3000)
npm run build       # 本番ビルド
npm run lint        # ESLint
npm run typecheck   # next typegen && tsc --noEmit
```

- `typecheck` が `next typegen` を先に呼ぶのは、`LayoutProps` などのルート型が `.next/types` に生成されるため。`tsc` 単体は新規環境で失敗する。CI(`.github/workflows/ci.yml`)も typecheck → lint → build の順で実行。
- テストランナーは未導入(集計ロジックのユニットテスト導入時に追記すること)。

## 注意点

- Next.js 16 / React 19 / Tailwind v4 を使用。破壊的変更があるため、コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認する(`AGENTS.md` の指示)。`AGENTS.md` は文字化けしているが内容はこの趣旨。
- テーマ色は `src/app/globals.css` のCSS変数(`--brand` 等)とTailwindの `bg-brand` / `text-brand` などで共通化されている。色を直書きしない。
- 作業フォルダ名が日本語・非ASCIIのため、`create-next-app` はこのフォルダ内で直接実行できない(パッケージ名検証で失敗する)。パッケージ名は `sales-dashboard`。

## 認証とDB(機能2で実装済み)

- Supabaseプロジェクト `sales-dashboard`(ref: `jvxfmspliwusdexrxduz`, 東京リージョン)。接続情報は `.env.local`(`.env.example` に雛形)。無料枠は同時稼働2プロジェクトまで(他案件の `multichannel-notify` は停止済み)。
- スキーマは `supabase/migrations/` が正。DB変更は migration ファイルを追加し、`apply_migration` で適用する。全テーブルRLS有効。閲覧は「承認済み(`profiles.approved = true`)のメンバー」のみ(`is_member()`)、書き込みは承認済みかつ `role = 'marketer'` のみ(`is_marketer()`)。
- **新規ユーザーは `viewer` かつ未承認(`approved = false`)で作られ、何も読めない。** 使わせたいユーザーは Supabase の SQL/Table Editor で `profiles.approved = true` に更新し、アップロード担当は `role = 'marketer'` にする。これはSupabaseのサインアップが開いたままでも、第三者がデータを読めないようにする二重の防御。Supabaseダッシュボード(Authentication → Sign In / Providers)で「Allow new users to sign up」をオフにすることも推奨(MCPからは設定できないため手動)。
- 認証の流れ: `src/proxy.ts`(Next.js 16 では middleware ではなく proxy)が全リクエストでセッションを検証し、未ログインは `/login` へ。ユーザー作成画面はなく、ユーザーは Supabase ダッシュボードで作る。
- `cacheComponents: true` が有効。Cookie を読むコンポーネント(例 `AuthControls`)は `<Suspense>` で囲まないとビルドが失敗する。

## アプリの構造(機能3〜10で実装済み)

データの流れ: CSV → `lib/csv/`(デコード・パース・検証)→ `lib/data/import.ts`(Supabaseへ保存)→ `lib/data/kpi.ts`(DBから月次データ取得)→ `lib/kpi/calc.ts`(集計の純関数)→ 画面(`app/page.tsx` + `components/`)。AIは `lib/ai/`(`facts.ts` で渡す数値と検証、`generateComment.ts` でClaude呼び出し)→ `app/ai/actions.ts` → `ai_comments` テーブル。

- 集計ロジックは副作用のない純関数(`lib/kpi/calc.ts`, `lib/csv/parse*.ts`, `lib/ai/facts.ts`)に閉じ込め、単体テストする。DB・Cookieに触るコードは `lib/data/`, `app/*/actions.ts`, `lib/supabase/` に分ける。
- 売上CSVは2形式を自動判定(`lib/csv/parseSales.ts`): Shopify注文CSV(`parseOrders.ts`)と、案件8の公式サンプルのLUMINA形式(`parseLumina.ts`。注文番号なし・revenue/costは行の合計)。LUMINA形式は行ごとの売上・原価を `orders.line_revenue` / `line_cost` にそのまま保存し(単価×数量だと割り切れない金額で1円未満ずれるため)、売上・粗利は `line_*` があればそれを優先、なければ 数量×単価 / 商品マスタ×数量。注文IDは `日付|顧客ID`(同じ日の同じ顧客=1注文。日付は整えてから使うので書き方が違っても同じ注文になる)。原価が1行でも空欄の行は合算後も `line_cost = null`(粗利を過大にしない)。売上CSV由来の商品マスタは新しいSKUだけ追加し、既存マスタは上書きしない。集計の合計は小数2桁に丸める(0.1+0.2の誤差対策)。公式サンプルは `tests/fixtures/sample-sales.csv`(`case8-sales-sample.csv` と同じ)で、`docs/sample-data.md` の「正解値」と単体テストで照合している。
- 公式サンプルの説明書にある「リピート率28.6%」は全期間の顧客ベース(2か月以上購入した人÷全顧客)。ダッシュボードのリピート率は月次(当月の購入者のうち過去にも購入した人の割合)で定義が違う。
- CSVの列名対応は `lib/csv/columns.ts` の別名リストだけで変更できる。Shopifyは注文単位の項目(メール・日時・ステータス)が先頭行にしかないため、パーサーが後続行へ引き継ぐ。
- Supabaseは1回のSELECTが1000行まで。複数行を読むときは必ず `lib/supabase/paging.ts` の `fetchAllPages` を使い、`order()` を付ける。
- `"use server"` ファイルは非同期関数しか export できない。型・初期値は `state.ts` に分ける(`app/upload/state.ts`, `app/ai/state.ts`)。
- AIコメント: モデルは `ANTHROPIC_MODEL`(既定 `claude-sonnet-5-5`。月額予算のため。以前の既定は `claude-opus-5-5`)。出力はzodスキーマの構造化出力。AIが根拠として引用した数値を `validateEvidence` で検証し、不一致なら1回だけ再生成、それでも不一致なら保存しない。生成の試行(失敗も含む)は全体で24時間に5回まで(`ai_generation_log` テーブルで数える。コスト上限)。各アクションは根拠(evidence)が1件以上必須。本文中の数値までは検証していない(既知の制限)。
- 注文の再取り込みは upsert(同じ注文番号×SKUは最新の内容で上書き)。返金・数量変更が反映される。途中失敗時も取り込み済みの分は消さない(`uploads` を消すと `orders` がcascadeで消えるため、巻き戻しはしない)。同じファイルの再アップロードで続きから反映できる。
- CSVの数値は `lib/csv/values.ts` で厳密に検証(指数表記・16進・負数・桁あふれは不可)。文字列は200文字で切り詰め。`"use server"` のアップロード上限は `next.config.ts` で11MBに設定。AI生成のため `app/page.tsx` に `maxDuration = 60`。
- 粗利は原価登録済みSKUのみで計算(未登録は警告表示)。リピート率は過去の購入履歴が全くないとき「算出不可」。
- `monthly_kpi` テーブルは作成済みだが未使用(集計は都度計算)。

## テスト

- `npm test`: 単体テスト(vitest)。`src/**/*.test.ts`。単体で実行: `npx vitest run src/lib/kpi/calc.test.ts` / テスト名で絞る: `npx vitest run -t "リピート率"`
- 結合テスト(実Supabaseに書き込む): `INTEGRATION=1 TEST_EMAIL=... TEST_PASSWORD=... npm test`(承認済みmarketerのテストユーザーが必要。通常はスキップされる)。公式サンプルを取り込み、説明書の正解値と照合し、返金の反映まで確認して元に戻す。DBの2025年9〜11月に公式サンプル以外のデータがあると失敗する。
- **現在のDBには案件8の公式サンプル(LUMINA形式・注文40件・商品8件、2025年9〜11月)だけが入っている**(`case8-sales-sample.csv`。単体テストは同じ内容の `tests/fixtures/sample-sales.csv` を読む)。説明書の正解値と一致することを確認済み。以前使っていた自作のダミー(Shopify形式、`sample-data/`)は削除済みで、復元しない。Shopify形式の取り込みは単体テスト(`parseOrders.test.ts`)で確認している。

## 設計上の前提(実装済みではない。計画の決定事項)

- CSVはShopify注文エクスポート標準列。列マッピングは設定ファイル化する。
- 粗利は商品マスタCSV(SKU・原価)を別途アップロードして算出。リピート率は顧客メールのハッシュで判定し、個人情報は保存・表示しない。
- 在庫回転率・日次軸・Shopify API連携はPhase 2(MVP対象外)。
- AIにはKPI集計結果のみを渡す(生データは渡さない)。出力数値は入力と整合性チェックする。月額予算は5,000円以内のため、生成は月1回+手動再生成、回数上限あり。
