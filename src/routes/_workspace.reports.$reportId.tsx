import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Printer, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorMessage, formatDate, MockBadge, Pill, PriorityBadge, ReportStatusBadge, SectionCard } from "@/components/common";
import { NpkChart, PhScale, SoilParameterCard } from "@/components/soil-charts";
import { useReport } from "@/hooks/use-soil";
import { useI18n } from "@/lib/i18n";
import type { ActionRecommendation, SoilReport } from "@/types/api";

export const Route = createFileRoute("/_workspace/reports/$reportId")({
  head: () => ({
    meta: [
      { title: "Soil Report — Soil2Action" },
      { name: "description", content: "Soil analysis results and farming action plan." },
      { property: "og:title", content: "Soil Report — Soil2Action" },
      { property: "og:description", content: "Soil analysis results and farming action plan." },
    ],
  }),
  component: ReportPage,
});

const PRIO = { high: 0, medium: 1, low: 2 } as const;

function ReportPage() {
  const { reportId } = Route.useParams();
  const { t } = useI18n();
  const q = useReport(reportId);

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  if (q.isError) return <ErrorMessage title={t("rep.notFound")} error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <EmptyState title={t("rep.notFound")} />;
  return <ReportView report={q.data} />;
}

function ReportView({ report }: { report: SoilReport }) {
  const { t, lang } = useI18n();
  const a = report.analysis;
  const m = report.measurements ?? report.request?.measurements ?? null;
  const ph = a?.parameters.find((p) => p.key === "ph")?.value ?? m?.ph ?? null;

  const share = async () => {
    const text = [
      `Soil2Action — ${report.field_name} (${report.crop})`,
      a ? `${a.overall_assessment.label}: ${a.overall_assessment.summary}` : "",
      ...(a?.recommendations ?? []).slice(0, 5).map((r, i) => `${i + 1}. ${r.title}`),
      report.is_mock ? "[MOCK — not a real analysis]" : "",
    ].filter(Boolean).join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Soil2Action report", text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success(t("rep.copied"));
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link to="/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("nav.history")}
        </Link>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{t("rep.title")}</h1>
            <ReportStatusBadge status={report.status} />
            {report.is_mock && <MockBadge />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.field_name} · {report.crop} · {report.field_size} {t(`unit.${report.field_size_unit}`)} · {formatDate(report.created_at, lang)}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <Button variant="outline" onClick={share}><Share2 className="h-4 w-4" /> {t("rep.share")}</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> {t("rep.print")}</Button>
        </div>
      </div>

      {!a ? (
        <EmptyState icon={AlertCircle} title={t(`status.${report.status}`)} description={t("rep.notSpecified")} />
      ) : (
        <>
          <SectionCard title={t("rep.overall")}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xl font-semibold">{a.overall_assessment.label}</span>
              {a.overall_assessment.score != null && <Pill variant="neutral">{a.overall_assessment.score}/100</Pill>}
            </div>
            <p className="mt-3 leading-relaxed">{a.overall_assessment.summary}</p>
            <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{t("rep.hindiSummary")}</p>
              <p className="mt-1">{a.overall_assessment.summary_hi || <span className="italic text-muted-foreground">{t("rep.noHindi")}</span>}</p>
            </div>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("rep.phScale")}><PhScale value={ph} /></SectionCard>
            <SectionCard title={t("rep.nutrients")}>
              {m ? <NpkChart n={m.nitrogen} p={m.phosphorus} k={m.potassium} /> : <p className="text-sm text-muted-foreground">{t("form.notProvided")}</p>}
            </SectionCard>
          </div>

          <SectionCard title={t("rep.params")}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {a.parameters.map((p) => <SoilParameterCard key={p.key} p={p} />)}
            </div>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("rep.concerns")}>
              {a.concerns.length ? (
                <ul className="space-y-2 text-sm">
                  {a.concerns.map((c) => <li key={c} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{c}</li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t("rep.none")}</p>}
            </SectionCard>
            <SectionCard title={t("rep.crops")}>
              {a.crop_guidance.length ? (
                <ul className="space-y-3">
                  {a.crop_guidance.map((c) => (
                    <li key={c.crop} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.crop}</span>
                        <Pill variant={c.suitability === "suitable" ? "good" : c.suitability === "not_recommended" ? "bad" : c.suitability === "conditional" ? "warn" : "neutral"}>
                          {c.suitability.replace("_", " ")}
                        </Pill>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t("rep.none")}</p>}
            </SectionCard>
          </div>

          <ActionPlan reportId={report.report_id} items={a.recommendations} />

          <SectionCard title={t("rep.limitations")}>
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">{t("rep.confidence")}: </span>
                {a.confidence != null ? `${Math.round(a.confidence * (a.confidence <= 1 ? 100 : 1))}%` : t("rep.notSpecified")}</p>
              {a.missing_information && a.missing_information.length > 0 && (
                <div>
                  <p className="font-medium">{t("rep.missing")}</p>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">{a.missing_information.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              {a.limitations?.length ? <ul className="list-inside list-disc text-muted-foreground">{a.limitations.map((x) => <li key={x}>{x}</li>)}</ul> : null}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function ActionPlan({ reportId, items }: { reportId: string; items: ActionRecommendation[] }) {
  const { t } = useI18n();
  const key = `s2a.done.${reportId}`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(key) ?? "{}")); } catch { setDone({}); }
  }, [key]);
  const toggle = (id: string, v: boolean) => {
    const nextDone = { ...done, [id]: v };
    setDone(nextDone);
    localStorage.setItem(key, JSON.stringify(nextDone));
  };
  const sorted = [...items].sort((x, y) => PRIO[x.priority] - PRIO[y.priority]);
  const ns = t("rep.notSpecified");

  return (
    <SectionCard title={t("rep.plan")}>
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">{t("rep.planHint")}</p>
      {sorted.length === 0 ? <p className="text-sm text-muted-foreground">{t("rep.none")}</p> : (
        <ol className="space-y-3">
          {sorted.map((r, i) => (
            <li key={r.id} className="rounded-xl border p-4 data-[done=true]:bg-muted" data-done={!!done[r.id]}>
              <div className="flex items-start gap-3">
                <Checkbox id={`a-${r.id}`} checked={!!done[r.id]} onCheckedChange={(v) => toggle(r.id, v === true)} className="mt-1" aria-label={t("rep.done")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`a-${r.id}`} className="font-semibold">{i + 1}. {r.title}</label>
                    <PriorityBadge priority={r.priority} />
                    {done[r.id] && <Pill variant="good">{t("rep.done")}</Pill>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Row l={t("rep.input")} v={r.input ?? ns} />
                    <Row l={t("rep.quantity")} v={r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : ns} />
                    <Row l={t("rep.timing")} v={r.timing ?? ns} />
                    <Row l={t("rep.cost")} v={r.estimated_cost ? `${r.estimated_cost.currency} ${r.estimated_cost.amount}` : ns} />
                  </dl>
                  {r.cautions?.length ? (
                    <div className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning-foreground">
                      <p className="font-medium">{t("rep.cautions")}</p>
                      <ul className="mt-1 list-inside list-disc">{r.cautions.map((c) => <li key={c}>{c}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{l}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
