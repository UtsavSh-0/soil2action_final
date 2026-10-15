import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, FileText, MapPinned, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BackendStatus } from "@/components/backend-status";
import { EmptyState, ErrorMessage, ListSkeleton, MockBadge, SectionCard, SummaryCard } from "@/components/common";
import { ReportCard } from "@/components/report-card";
import { NpkChart, PhScale } from "@/components/soil-charts";
import { useFields, useHistory } from "@/hooks/use-soil";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_workspace/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Soil2Action" },
      { name: "description", content: "Your fields, soil reports and latest soil parameters." },
      { property: "og:title", content: "Dashboard — Soil2Action" },
      { property: "og:description", content: "Your fields, soil reports and latest soil parameters." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const history = useHistory({ page: 1, page_size: 50 });
  const fields = useFields();
  const [fieldId, setFieldId] = useState("all");
  const [farmerName, setFarmerName] = useState<string | null>(null);
  useEffect(() => setFarmerName(localStorage.getItem("s2a.farmerName")), []);

  const reports = useMemo(() => {
    const items = history.data?.items ?? [];
    return fieldId === "all" ? items : items.filter((r) => r.field_id === fieldId);
  }, [history.data, fieldId]);
  const recentCount = useMemo(() => {
    const cutoff = Date.now() - 30 * 864e5;
    return reports.filter((r) => new Date(r.created_at).getTime() >= cutoff).length;
  }, [reports]);
  const latest = reports.find((r) => r.measurements);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("dash.greeting")}, {farmerName || t("dash.farmer")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dash.sub")}</p>
        </div>
        <div className="flex gap-2">
          <Select value={fieldId} onValueChange={setFieldId}>
            <SelectTrigger className="w-44 bg-card" aria-label={t("dash.selectField")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dash.selectField")}</SelectItem>
              {fields.data?.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild>
            <Link to="/analyze"><Plus className="h-4 w-4" /> {t("nav.analyze")}</Link>
          </Button>
        </div>
      </div>

      <BackendStatus />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={FileText} label={t("dash.totalReports")} value={history.isError ? "—" : (fieldId === "all" ? history.data?.total : reports.length) ?? 0} loading={history.isLoading} />
        <SummaryCard icon={MapPinned} label={t("dash.fields")} value={fields.isError ? "—" : (fields.data?.length ?? 0)} loading={fields.isLoading} />
        <SummaryCard icon={Activity} label={t("dash.recent")} value={history.isError ? "—" : recentCount} loading={history.isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title={t("dash.recentReports")}
          action={<Link to="/history" className="text-sm font-medium text-primary hover:underline">{t("dash.viewAll")}</Link>}
        >
          {history.isLoading ? (
            <ListSkeleton />
          ) : history.isError ? (
            <ErrorMessage error={history.error} onRetry={() => history.refetch()} />
          ) : reports.length === 0 ? (
            <EmptyState
              title={t("dash.emptyTitle")}
              description={t("dash.emptyDesc")}
              action={<Button asChild><Link to="/analyze">{t("cta.analyze")}</Link></Button>}
            />
          ) : (
            <div className="space-y-3">
              {reports.slice(0, 5).map((r) => <ReportCard key={r.report_id} report={r} />)}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("dash.latestParams")} action={latest?.is_mock ? <MockBadge /> : undefined}>
          {latest?.measurements ? (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">{latest.field_name} · {latest.crop}</p>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">pH</p>
                <PhScale value={latest.measurements.ph} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">N · P · K (kg/ha)</p>
                <NpkChart n={latest.measurements.nitrogen} p={latest.measurements.phosphorus} k={latest.measurements.potassium} />
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("dash.noParams")}</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
