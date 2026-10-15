import type { TKey } from "@/lib/i18n";
import type { FieldSizeUnit, SoilAnalysisRequest, Language } from "@/types/api";

export interface AnalysisFormValues {
  farmerName: string;
  state: string;
  district: string;
  fieldId: string;
  fieldName: string;
  fieldSize: string;
  fieldSizeUnit: FieldSizeUnit;
  currentCrop: string;
  intendedCrop: string;
  ph: string;
  ec: string;
  oc: string;
  n: string;
  p: string;
  k: string;
  zinc: string;
  iron: string;
  manganese: string;
  copper: string;
  boron: string;
  sulphur: string;
  testDate: string;
}

export const emptyForm: AnalysisFormValues = {
  farmerName: "", state: "", district: "", fieldId: "", fieldName: "", fieldSize: "",
  fieldSizeUnit: "acre", currentCrop: "", intendedCrop: "",
  ph: "", ec: "", oc: "", n: "", p: "", k: "",
  zinc: "", iron: "", manganese: "", copper: "", boron: "", sulphur: "", testDate: "",
};

export type FieldError = { key: TKey; vars?: Record<string, number> };
export type Errors = Partial<Record<keyof AnalysisFormValues, FieldError>>;

export const RANGES = {
  ph: [0, 14], ec: [0, 20], oc: [0, 10], n: [0, 2000], p: [0, 1000], k: [0, 3000], micro: [0, 1000],
} as const;

export const MICRO_KEYS = ["zinc", "iron", "manganese", "copper", "boron", "sulphur"] as const;

/** Blank → null (never zero). Invalid text → NaN. */
export function parseOptional(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  if (!/^-?\d*\.?\d+$/.test(s)) return Number.NaN;
  return Number(s);
}

function checkNum(v: string, required: boolean, [min, max]: readonly [number, number]): FieldError | undefined {
  const n = parseOptional(v);
  if (n === null) return required ? { key: "v.required" } : undefined;
  if (Number.isNaN(n)) return { key: "v.number" };
  if (n < min || n > max) return { key: "v.range", vars: { min, max } };
  return undefined;
}

export function validateStep(step: number, v: AnalysisFormValues, today = new Date()): Errors {
  const e: Errors = {};
  if (step === 0) {
    for (const k of ["farmerName", "state", "district", "fieldName", "currentCrop"] as const) {
      if (!v[k].trim()) e[k] = { key: "v.required" };
      else if (v[k].length > 100) e[k] = { key: "v.range", vars: { min: 1, max: 100 } };
    }
    const size = parseOptional(v.fieldSize);
    if (size === null) e.fieldSize = { key: "v.required" };
    else if (Number.isNaN(size)) e.fieldSize = { key: "v.number" };
    else if (size <= 0) e.fieldSize = { key: "v.positive" };
    else if (size > 100000) e.fieldSize = { key: "v.range", vars: { min: 0, max: 100000 } };
  }
  if (step === 1) {
    const set = (k: keyof AnalysisFormValues, err?: FieldError) => { if (err) e[k] = err; };
    set("ph", checkNum(v.ph, true, RANGES.ph));
    set("ec", checkNum(v.ec, false, RANGES.ec));
    set("oc", checkNum(v.oc, false, RANGES.oc));
    set("n", checkNum(v.n, true, RANGES.n));
    set("p", checkNum(v.p, true, RANGES.p));
    set("k", checkNum(v.k, true, RANGES.k));
    for (const m of MICRO_KEYS) set(m, checkNum(v[m], false, RANGES.micro));
    if (!v.testDate) e.testDate = { key: "v.required" };
    else if (new Date(v.testDate) > today) e.testDate = { key: "v.futureDate" };
  }
  return e;
}

export function toRequest(v: AnalysisFormValues, language: Language): SoilAnalysisRequest {
  const num = (s: string) => parseOptional(s) as number;
  const opt = (s: string) => parseOptional(s);
  return {
    farmer: { name: v.farmerName.trim(), state: v.state.trim(), district: v.district.trim() },
    field: {
      id: v.fieldId || null,
      name: v.fieldName.trim(),
      size: num(v.fieldSize),
      size_unit: v.fieldSizeUnit,
      current_crop: v.currentCrop.trim(),
      intended_crop: v.intendedCrop.trim() || null,
    },
    measurements: {
      ph: num(v.ph),
      electrical_conductivity: opt(v.ec),
      organic_carbon: opt(v.oc),
      nitrogen: num(v.n),
      phosphorus: num(v.p),
      potassium: num(v.k),
      nutrient_unit: "kg/ha",
      micronutrient_unit: "ppm",
      micronutrients: {
        zinc: opt(v.zinc), iron: opt(v.iron), manganese: opt(v.manganese),
        copper: opt(v.copper), boron: opt(v.boron), sulphur: opt(v.sulphur),
      },
      test_date: v.testDate,
    },
    language,
  };
}
