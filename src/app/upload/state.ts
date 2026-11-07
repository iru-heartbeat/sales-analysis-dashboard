import type { RowError } from "@/lib/types";

// "use server" ファイルは非同期関数しか export できないため、型と初期値はここに置く
export type UploadState = {
  status: "idle" | "success" | "error";
  message: string;
  errors: RowError[]; // 取り込めなかった行(先頭の一部)
};

export const initialUploadState: UploadState = { status: "idle", message: "", errors: [] };
