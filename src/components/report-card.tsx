import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { SoilReport } from "@/types/api";
import { formatDate, MockBadge, ReportStatusBadge } from "./common";

export function ReportCard({ report, actions }: { report: SoilReport; actions?: ReactNode }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <Link to="/reports/$reportId" params={{ reportId: report.report_id }} className="group flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-earth-soft text-earth">
          <MapPin className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium group-hover:underline">{report.field_name}</p>
            <ReportStatusBadge status={report.status} />
            {report.is_mock && <MockBadge />}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {report.crop} · {report.field_size} {t(`unit.${report.field_size_unit}`)} · {formatDate(report.created_at, lang)}
          </p>
        </div>
        {!actions && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </Link>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
