import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { ParameterAssessment } from "@/types/api";
import { Pill, paramTone } from "./common";

/** pH position on a 0–14 scale. Bands are descriptive only; status comes from the backend. */
export function PhScale({ value }: { value: number | null }) {
  const { t } = useI18n();
  const pct = value === null ? null : Math.min(100, Math.max(0, (value / 14) * 100));
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div className="h-full flex-[5.5] bg-warning/70" />
          <div className="h-full flex-[2] bg-success/70" />
          <div className="h-full flex-[6.5] bg-chart-5/60" />
        </div>
      </div>
      {pct !== null && (
        <div className="relative h-6">
          <div className="absolute -translate-x-1/2 text-center" style={{ left: `${pct}%` }}>
            <div className="mx-auto h-2 w-0.5 bg-foreground" />
            <span className="text-xs font-semibold tabular-nums">{value}</span>
          </div>
        </div>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>0 · Acidic</span>
        <span>7 · Neutral</span>
        <span>Alkaline · 14</span>
      </div>
      {value === null && <p className="mt-2 text-xs text-muted-foreground">{t("form.notProvided")}</p>}
    </div>
  );
}

export function NpkChart({ n, p, k, height = 200 }: { n: number | null; p: number | null; k: number | null; height?: number }) {
  const data = [
    { name: "N", value: n },
    { name: "P", value: p },
    { name: "K", value: k },
  ].filter((d) => d.value !== null);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12 }}
            formatter={(v: number) => [`${v} kg/ha`, ""]}
          />
          <Bar dataKey="value" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SoilParameterCard({ p }: { p: ParameterAssessment }) {
  const { t } = useI18n();
  return (
    <div className={cn("rounded-xl border bg-card p-4", p.value === null && "border-dashed")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{p.label}</p>
        <Pill variant={paramTone(p.status)}>{p.status.replace("_", " ")}</Pill>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {p.value === null ? <span className="text-base font-normal text-muted-foreground">{t("form.notProvided")}</span> : p.value}
        {p.value !== null && p.unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{p.unit}</span>}
      </p>
      {p.explanation && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.explanation}</p>}
    </div>
  );
}
