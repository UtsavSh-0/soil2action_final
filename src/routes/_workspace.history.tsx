import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, Printer, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorMessage, ListSkeleton, useErrorText } from "@/components/common";
import { ReportCard } from "@/components/report-card";
import { useDeleteReport, useFields, useHistory } from "@/hooks/use-soil";
import { useI18n } from "@/lib/i18n";
import type { ReportStatus } from "@/types/api";

export const Route = createFileRoute("/_workspace/history")({
  head: () => ({
    meta: [
      { title: "Report History — Soil2Action" },
      { name: "description", content: "Search, view, print and manage your soil analysis reports." },
      { property: "og:title", content: "Report History — Soil2Action" },
      { property: "og:description", content: "Search, view, print and manage your soil analysis reports." },
    ],
  }),
  component: HistoryPage,
});

const PAGE = 10;

function HistoryPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const errText = useErrorText();
  const history = useHistory({ page: 1, page_size: 200 });
  const fields = useFields();
  const del = useDeleteReport();
  const [search, setSearch] = useState("");
  const [crop, setCrop] = useState("all");
  const [field, setField] = useState("all");
  const [status, setStatus] = useState<"all" | ReportStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const all = history.data?.items ?? [];
  const crops = useMemo(() => [...new Set(all.map((r) => r.crop))].sort(), [all]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((r) => {
      if (s && ![r.field_name, r.crop, r.farmer_name ?? ""].some((x) => x.toLowerCase().includes(s))) return false;
      if (crop !== "all" && r.crop !== crop) return false;
      if (field !== "all" && r.field_id !== field) return false;
      if (status !== "all" && r.status !== status) return false;
      const d = r.created_at.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [all, search, crop, field, status, from, to]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE, current * PAGE);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete);
      toast.success(t("hist.deleted"));
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("hist.title")}</h1>

      <div className="card-surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t("hist.search")} aria-label={t("hist.search")} className="pl-9" />
        </div>
        <Select value={crop} onValueChange={(v) => { setCrop(v); setPage(1); }}>
          <SelectTrigger aria-label={t("hist.allCrops")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hist.allCrops")}</SelectItem>
            {crops.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={field} onValueChange={(v) => { setField(v); setPage(1); }}>
          <SelectTrigger aria-label={t("dash.selectField")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dash.selectField")}</SelectItem>
            {fields.data?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
          <SelectTrigger aria-label={t("hist.allStatus")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hist.allStatus")}</SelectItem>
            {(["completed", "pending", "failed"] as const).map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("hist.from")} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("hist.to")} />
        </div>
      </div>

      {history.isLoading ? <ListSkeleton rows={5} /> : history.isError ? (
        <ErrorMessage error={history.error} onRetry={() => history.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState title={t("dash.emptyTitle")} description={t("dash.emptyDesc")} action={<Button asChild><Link to="/analyze">{t("cta.analyze")}</Link></Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("hist.empty")} />
      ) : (
        <>
          <div className="space-y-3">
            {visible.map((r) => (
              <ReportCard key={r.report_id} report={r} actions={
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/reports/$reportId" params={{ reportId: r.report_id }}><Eye className="h-4 w-4" /> {t("hist.view")}</Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate({ to: "/reports/$reportId", params: { reportId: r.report_id } }).then(() => setTimeout(() => window.print(), 600))}>
                    <Printer className="h-4 w-4" /><span className="sr-only sm:not-sr-only">{t("hist.print")}</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPendingDelete(r.report_id)} aria-label={t("hist.delete")}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              } />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t("hist.prev")}</Button>
              <span className="text-sm text-muted-foreground">{t("hist.page", { p: current, n: pages })}</span>
              <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>{t("hist.next")}</Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hist.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hist.confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("hist.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} disabled={del.isPending}>
              {t("hist.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
