import { createFileRoute } from "@tanstack/react-router";
import { AnalysisForm } from "@/components/analysis-form";
import { BackendStatus } from "@/components/backend-status";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_workspace/analyze")({
  head: () => ({
    meta: [
      { title: "New Soil Analysis — Soil2Action" },
      { name: "description", content: "Enter your Soil Health Card values to get a farming action plan." },
      { property: "og:title", content: "New Soil Analysis — Soil2Action" },
      { property: "og:description", content: "Enter your Soil Health Card values to get a farming action plan." },
    ],
  }),
  component: AnalyzePage,
});

function AnalyzePage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("form.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("form.sub")}</p>
      </div>
      <BackendStatus />
      <AnalysisForm />
    </div>
  );
}
