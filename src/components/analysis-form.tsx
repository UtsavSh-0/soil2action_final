import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2, Pencil } from "lucide-react";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnalyze, useFields } from "@/hooks/use-soil";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  emptyForm, MICRO_KEYS, toRequest, validateStep,
  type AnalysisFormValues, type Errors,
} from "@/lib/soil-validation";
import { ErrorMessage, SectionCard } from "./common";

type K = keyof AnalysisFormValues;
const STEPS: TKey[] = ["form.step1", "form.step2", "form.step3", "form.step4"];

const FormCtx = createContext<{ v: AnalysisFormValues; errors: Errors; set: (k: K, val: string) => void } | null>(null);

function F({ k, label, required, unit, type = "text", inputMode, children }: { k: K; label: TKey; required?: boolean; unit?: string; type?: string; inputMode?: "decimal"; children?: ReactNode }): ReactNode {
    const { t } = useI18n();
    const { v, errors, set } = useContext(FormCtx)!;
    const err = errors[k];
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`f-${k}`} className="flex items-center gap-2">
          {t(label)}
          <span className={cn("text-[11px] font-normal", required ? "text-destructive" : "text-muted-foreground")}>
            {required ? `* ${t("form.required")}` : t("form.optional")}
          </span>
        </Label>
        {children ?? (
          <div className="relative">
            <Input
              id={`f-${k}`}
              type={type}
              inputMode={inputMode}
              value={v[k]}
              onChange={(e) => set(k, e.target.value)}
              aria-invalid={!!err}
              aria-describedby={err ? `e-${k}` : undefined}
              className={cn("bg-card", unit && "pr-16", err && "border-destructive")}
            />
            {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unit}</span>}
          </div>
        )}
        {err && <p id={`e-${k}`} className="text-xs text-destructive">{t(err.key, err.vars)}</p>}
      </div>
    );
  }

export function AnalysisForm() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const fields = useFields();
  const analyze = useAnalyze();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<AnalysisFormValues>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const inFlight = useRef(false);

  const set = (k: K, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const next = () => {
    const e = validateStep(step, v);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
    else document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
  };

  const submit = async () => {
    if (inFlight.current) return;
    const e = { ...validateStep(0, v), ...validateStep(1, v) };
    if (Object.keys(e).length) {
      setErrors(e);
      setStep(validateStep(0, v) && Object.keys(validateStep(0, v)).length ? 0 : 1);
      return;
    }
    inFlight.current = true;
    setStep(3);
    try {
      const res = await analyze.mutateAsync(toRequest(v, lang));
      localStorage.setItem("s2a.farmerName", v.farmerName.trim());
      navigate({ to: "/reports/$reportId", params: { reportId: res.report_id } });
    } catch {
      /* error shown from mutation state */
    } finally {
      inFlight.current = false;
    }
  };

  const Review = ({ title, goTo, rows }: { title: TKey; goTo: number; rows: [TKey, string][] }) => (
    <SectionCard title={t(title)} action={<Button variant="ghost" size="sm" onClick={() => setStep(goTo)}><Pencil className="h-3.5 w-3.5" /> {t("form.edit")}</Button>}>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([l, val]) => (
          <div key={l} className="flex justify-between gap-3 border-b border-dashed pb-2 text-sm">
            <dt className="text-muted-foreground">{t(l)}</dt>
            <dd className={cn("text-right font-medium", !val && "font-normal italic text-muted-foreground")}>{val || t("form.notProvided")}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );

  return (
    <FormCtx.Provider value={{ v, errors, set }}>
    <div className="space-y-6">
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="space-y-2" aria-current={i === step ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
            <p className={cn("flex items-center gap-1 text-xs", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {i < step && <Check className="h-3 w-3 text-success" />}
              <span className="hidden sm:inline">{i + 1}. </span>{t(s)}
            </p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <SectionCard title={t("form.step1")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <F k="farmerName" label="form.farmerName" required />
            <div className="grid grid-cols-2 gap-3">
              <F k="state" label="form.state" required />
              <F k="district" label="form.district" required />
            </div>
            {fields.data && fields.data.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("dash.fields")}</Label>
                <Select
                  value={v.fieldId || "new"}
                  onValueChange={(id) => {
                    const f = fields.data?.find((x) => x.id === id);
                    setV((s) => f
                      ? { ...s, fieldId: f.id, fieldName: f.name, fieldSize: String(f.size), fieldSizeUnit: f.size_unit, currentCrop: f.current_crop ?? s.currentCrop }
                      : { ...s, fieldId: "" });
                  }}
                >
                  <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ {t("form.fieldName")}</SelectItem>
                    {fields.data.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <F k="fieldName" label="form.fieldName" required />
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <F k="fieldSize" label="form.fieldSize" required inputMode="decimal" />
              <div className="space-y-1.5">
                <Label htmlFor="f-unit">{t("form.unit")}</Label>
                <Select value={v.fieldSizeUnit} onValueChange={(u) => set("fieldSizeUnit", u)}>
                  <SelectTrigger id="f-unit" className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["acre", "hectare", "bigha"] as const).map((u) => <SelectItem key={u} value={u}>{t(`unit.${u}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <F k="currentCrop" label="form.currentCrop" required />
            <F k="intendedCrop" label="form.intendedCrop" />
          </div>
        </SectionCard>
      )}

      {step === 1 && (
        <SectionCard title={t("form.step2")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <F k="ph" label="form.ph" required inputMode="decimal" unit="0–14" />
            <F k="ec" label="form.ec" inputMode="decimal" unit="dS/m" />
            <F k="oc" label="form.oc" inputMode="decimal" unit="%" />
            <F k="n" label="form.n" required inputMode="decimal" unit="kg/ha" />
            <F k="p" label="form.p" required inputMode="decimal" unit="kg/ha" />
            <F k="k" label="form.k" required inputMode="decimal" unit="kg/ha" />
            <F k="testDate" label="form.testDate" required type="date" />
          </div>
          <div className="mt-6 rounded-lg bg-muted p-4">
            <p className="text-sm font-semibold">{t("form.micro")} <span className="font-normal text-muted-foreground">· {t("form.optional")}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{t("form.microHint")}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
              {MICRO_KEYS.map((m) => <F key={m} k={m} label={`form.${m}` as TKey} inputMode="decimal" unit="ppm" />)}
            </div>
          </div>
        </SectionCard>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("form.reviewHint")}</p>
          <Review title="form.step1" goTo={0} rows={[
            ["form.farmerName", v.farmerName], ["form.state", v.state], ["form.district", v.district],
            ["form.fieldName", v.fieldName], ["form.fieldSize", `${v.fieldSize} ${t(`unit.${v.fieldSizeUnit}`)}`],
            ["form.currentCrop", v.currentCrop], ["form.intendedCrop", v.intendedCrop],
          ]} />
          <Review title="form.step2" goTo={1} rows={[
            ["form.ph", v.ph], ["form.ec", v.ec && `${v.ec} dS/m`], ["form.oc", v.oc && `${v.oc} %`],
            ["form.n", `${v.n} kg/ha`], ["form.p", `${v.p} kg/ha`], ["form.k", `${v.k} kg/ha`],
            ...MICRO_KEYS.map((m) => [`form.${m}` as TKey, v[m] && `${v[m]} ppm`] as [TKey, string]),
            ["form.testDate", v.testDate],
          ]} />
        </div>
      )}

      {step === 3 && (
        <SectionCard>
          {analyze.isPending && (
            <div className="flex flex-col items-center py-12 text-center" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 font-medium">{t("form.submitting")}</p>
            </div>
          )}
          {analyze.isError && <ErrorMessage title={t("form.failed")} error={analyze.error} onRetry={submit} />}
        </SectionCard>
      )}

      <div className="flex justify-between gap-3">
        {step > 0 && !analyze.isPending ? (
          <Button variant="outline" onClick={() => setStep(step === 3 ? 2 : step - 1)}>{t("form.back")}</Button>
        ) : <span />}
        {step < 2 && <Button onClick={next}>{t("form.next")}</Button>}
        {step === 2 && <Button onClick={submit} disabled={analyze.isPending}>{t("form.submit")}</Button>}
      </div>
    </div>
    </FormCtx.Provider>
  );
}
