import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, FlaskConical, Leaf, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher, Logo, Pill } from "@/components/common";
import { NpkChart, PhScale } from "@/components/soil-charts";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Soil2Action — Understand Your Soil. Grow Smarter." },
      { name: "description", content: "Convert your Soil Health Card into a clear, prioritised farming action plan in English or Hindi." },
      { property: "og:title", content: "Soil2Action — Understand Your Soil. Grow Smarter." },
      { property: "og:description", content: "Convert your Soil Health Card into a clear, prioritised farming action plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  const features = [
    { icon: FlaskConical, t: t("feat.1.t"), d: t("feat.1.d") },
    { icon: Leaf, t: t("feat.2.t"), d: t("feat.2.d") },
    { icon: ClipboardList, t: t("feat.3.t"), d: t("feat.3.d") },
  ];
  const steps = [t("how.1"), t("how.2"), t("how.3")];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Main">
            <a href="#features" className="hover:text-foreground">{t("nav.features")}</a>
            <a href="#how" className="hover:text-foreground">{t("nav.how")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild size="sm">
              <Link to="/dashboard">{t("nav.openApp")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sprout className="h-3.5 w-3.5 text-success" aria-hidden /> Soil Health Card · मृदा स्वास्थ्य कार्ड
          </span>
          <h1 className="font-display mt-5 text-4xl font-semibold leading-[1.1] md:text-5xl">{t("hero.title")}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("hero.sub")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/analyze">
                {t("cta.analyze")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">{t("cta.how")}</a>
            </Button>
          </div>
        </div>

        <div className="card-surface p-5" aria-label="Dashboard preview">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">North Field · Wheat</p>
              <p className="font-semibold">Soil parameters</p>
            </div>
            <Pill variant="warn">{t("sample")}</Pill>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">pH</p>
              <PhScale value={7.8} />
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">N · P · K (kg/ha)</p>
              <NpkChart n={240} p={18} k={210} height={130} />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {["Apply organic manure before sowing", "Re-test zinc next season"].map((a, i) => (
              <div key={a} className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
                {a}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-t bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">{t("feat.title")}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.t} className="card-surface p-6">
                <f.icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-4 font-semibold">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-2xl font-semibold md:text-3xl">{t("how.title")}</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-4 rounded-xl border bg-card p-5">
              <span className="font-display grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-semibold text-accent-foreground">{i + 1}</span>
              <span className="font-medium">{s}</span>
            </li>
          ))}
        </ol>
        <Button asChild size="lg" className="mt-10">
          <Link to="/analyze">{t("cta.analyze")} <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav className="flex flex-wrap gap-5" aria-label="Footer">
            <a href="#features" className="hover:text-foreground">{t("footer.about")}</a>
            <a href="mailto:hello@soil2action.example" className="hover:text-foreground">{t("footer.contact")}</a>
            <a href="#how" className="hover:text-foreground">{t("footer.help")}</a>
            <a href="#" className="hover:text-foreground">{t("footer.privacy")}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
