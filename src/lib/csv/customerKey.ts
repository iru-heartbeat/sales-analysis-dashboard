import { createHmac } from "node:crypto";

/**
 * メールアドレスを元に戻せないハッシュ(HMAC-SHA256)に変換する。
 * 個人情報を保存せずに「同じ顧客かどうか」だけ判定できるようにするため。
 * メールが空の注文は、他の注文と同一視しないよう注文ごとに別の鍵にする。
 */
export function toCustomerKey(
  email: string,
  orderId: string,
  secret: string,
): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return `guest:${orderId}`;
  return createHmac("sha256", secret).update(normalized).digest("hex");
}
