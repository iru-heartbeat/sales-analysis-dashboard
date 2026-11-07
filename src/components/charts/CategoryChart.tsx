"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = { data: { category: string; revenue: number; share: number }[] };

const yenFormat = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export function CategoryChart({ data }: Props) {
  if (data.length === 0) return <p className="text-sm text-foreground/60">データがありません。</p>;
  return (
    <div className="h-72 w-full" role="img" aria-label="カテゴリ別売上の棒グラフ">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => `${Math.round(v / 10000)}万`} tick={{ fontSize: 12 }} width={56} />
          <Tooltip
            formatter={(value, _name, item) => [
              `${yenFormat(Number(value))}(構成比 ${(item.payload.share * 100).toFixed(1)}%)`,
              "売上",
            ]}
          />
          <Bar dataKey="revenue" fill="#1A2E5C" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
