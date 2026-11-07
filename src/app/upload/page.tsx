import { Suspense } from "react";
import { UploadForm } from "@/components/UploadForm";
import { getCurrentUser } from "@/lib/auth";
import { uploadOrders, uploadProducts } from "./actions";

export const metadata = { title: "データアップロード | 売上分析ダッシュボード" };

// ログイン状態(Cookie)を読むため、Suspenseで囲んだ中で描画する
export default function UploadPage() {
  return (
    <Suspense fallback={<p className="text-sm">読み込み中...</p>}>
      <UploadContent />
    </Suspense>
  );
}

async function UploadContent() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-brand">データアップロード</h1>
      {!user?.isMarketer ? (
        <p className="rounded border border-border bg-muted p-4 text-sm">
          アップロードはマーケ担当のみ可能です。権限が必要な場合は管理者に依頼してください。
        </p>
      ) : (
        <>
          <UploadForm
            title="① 商品マスタ(原価)"
            description="列: SKU, 商品名, カテゴリ, 原価。粗利とカテゴリ別集計に使います。先にこちらを登録してください。同じSKUは上書きされます。"
            action={uploadProducts}
          />
          <UploadForm
            title="② 売上データ(注文CSV)"
            description="Shopifyの注文エクスポートCSV、または案件8のサンプル形式(order_date, customer_id, product_name, category, sku, quantity, revenue, cost)を自動判定して取り込みます(UTF-8 / Shift_JIS)。同じ注文は上書きされ、重複しません。サンプル形式は商品マスタも同時に登録されるため、①は不要です。"
            action={uploadOrders}
          />
        </>
      )}
    </div>
  );
}
