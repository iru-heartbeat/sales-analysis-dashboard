// "use server" ファイルは非同期関数しか export できないため、型と初期値はここに置く
export type AiState = { status: "idle" | "success" | "error"; message: string };

export const initialAiState: AiState = { status: "idle", message: "" };
