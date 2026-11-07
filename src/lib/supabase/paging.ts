const PAGE_SIZE = 1000; // Supabaseの1回の取得上限に合わせる

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Supabaseは1回のSELECTで最大1000行しか返さない。
 * 1000行ずつ範囲を変えて、全件取得できるまで繰り返す。
 * 並び順が安定していないと取りこぼし・重複が出るため、呼び出し側で必ず order() を指定すること。
 */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PageResult<T>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}
