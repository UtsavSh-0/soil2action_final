import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { env, isMockEnabled, setMockEnabled } from "@/config/env";
import { useHealth } from "@/hooks/use-soil";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function BackendStatus() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const health = useHealth();
  const [mock, setMock] = useState(false);
  useEffect(() => setMock(isMockEnabled()), []);

  const online = health.isSuccess;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", health.isLoading ? "bg-muted-foreground" : online ? "bg-success" : "bg-destructive")} aria-hidden />
        <span className="font-medium">{t("api.status")}:</span>
        <span className="text-muted-foreground">
          {health.isLoading ? "…" : online ? t("api.online") : t("api.offline")}
          {!mock && env.apiBaseUrl && <span className="ml-1 hidden font-mono text-xs sm:inline">({env.apiBaseUrl})</span>}
        </span>
      </div>
      {env.isDev && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={mock}
            onCheckedChange={(v) => {
              setMockEnabled(v);
              setMock(v);
              qc.invalidateQueries();
            }}
          />
          {t("api.mockToggle")}
        </label>
      )}
      {mock && <p className="text-xs font-medium text-warning-foreground sm:hidden">{t("api.mock")}</p>}
    </div>
  );
}
