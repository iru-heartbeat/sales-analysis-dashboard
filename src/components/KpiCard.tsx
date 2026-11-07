type Delta = { label: string; text: string | null; positive: boolean | null };

type Props = {
  title: string;
  value: string;
  sub?: string;
  note?: string; // 定義や注意書き
  deltas: Delta[];
};

export function KpiCard({ title, value, sub, note, deltas }: Props) {
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-foreground/70">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-brand">{value}</p>
      {sub && <p className="mt-1 text-sm text-foreground/70">{sub}</p>}
      <dl className="mt-3 space-y-1 text-sm">
        {deltas.map((d) => (
          <div key={d.label} className="flex justify-between">
            <dt className="text-foreground/60">{d.label}</dt>
            <dd
              className={
                d.text === null
                  ? "text-foreground/40"
                  : d.positive
                    ? "font-medium text-green-700"
                    : "font-medium text-red-700"
              }
            >
              {d.text ?? "比較データなし"}
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 border-t border-border pt-2 text-xs text-foreground/60">{note}</p>}
    </div>
  );
}
