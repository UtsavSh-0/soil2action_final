import type { ReactNode } from "react";
import { AlertTriangle, Sprout, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ApiError, type ParameterStatus, type Priority, type ReportStatus } from "@/types/api";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-foreground", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Sprout className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="text-[17px] tracking-tight">
        Soil<span className="text-success">2</span>Action
      </span>
    </span>
  );
}

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLang(lang === "en" ? "hi" : "en")}
      aria-label={lang === "en" ? "हिन्दी में बदलें" : "Switch to English"}
    >
      {t("lang.switch")}
    </Button>
  );
}

export function SummaryCard({ label, value, icon: Icon, loading }: { label: string; value: ReactNode; icon: LucideIcon; loading?: boolean }) {
  return (
    <div className="card-surface flex items-center gap-4 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-6 w-12" /> : <p className="text-2xl font-semibold tabular-nums">{value}</p>}
      </div>
    </div>
  );
}

const tone = {
  good: "bg-success-soft text-primary",
  warn: "bg-warning-soft text-warning-foreground",
  bad: "bg-danger-soft text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function Pill({ variant, children }: { variant: keyof typeof tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tone[variant])}>{children}</span>;
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useI18n();
  const v = status === "completed" ? "good" : status === "pending" ? "warn" : "bad";
  return <Pill variant={v}>{t(`status.${status}`)}</Pill>;
}

export function paramTone(s: ParameterStatus): keyof typeof tone {
  if (s === "optimal" || s === "neutral" || s === "medium") return "good";
  if (s === "low" || s === "high" || s === "acidic" || s === "alkaline") return "warn";
  if (s === "very_low" || s === "very_high") return "bad";
  return "neutral";
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return <Pill variant={priority === "high" ? "bad" : priority === "medium" ? "warn" : "neutral"}>{t(`prio.${priority}`)}</Pill>;
}

export function MockBadge() {
  const { t } = useI18n();
  return <Pill variant="warn">{t("mockBadge")}</Pill>;
}

export function EmptyState({ title, description, action, icon: Icon = Sprout }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function useErrorText() {
  const { t } = useI18n();
  return (err: unknown) => {
    if (err instanceof ApiError) {
      const base = t(`err.${err.kind}`);
      return err.kind === "http" ? `${base} (${err.status}) ${err.message}` : base;
    }
    return t("err.generic");
  };
}

export function ErrorMessage({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { t } = useI18n();
  const text = useErrorText()(error);
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-danger-soft p-4 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
      <div className="flex-1 text-sm">
        {title && <p className="font-semibold text-destructive">{title}</p>}
        <p className="text-foreground">{text}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function SectionCard({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card-surface print-area p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function formatDate(iso: string, lang: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
}
