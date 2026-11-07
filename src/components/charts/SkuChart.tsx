"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = { data: { sku: string; name: string; revenue: number; qty: number }[] };

const yenFormat = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export function SkuChart({ data }: Props) {
  if (data.length === 0) return <p className="text-sm text-foreground/60">データがありません。</p>;
  return (
    <div className="w-full" style={{ height: Math.max(220, data.length * 36 + 40) }} role="img" aria-label="SKU別売上トップ10の横棒グラフ">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v / 10000)}万`} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} interval={0} />
          <Tooltip
            formatter={(value, _name, item) => [`${yenFormat(Number(value))}(${item.payload.qty}点)`, "売上"]}
          />
          <Bar dataKey="revenue" fill="#1A2E5C" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
