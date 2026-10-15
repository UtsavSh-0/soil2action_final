/**
 * Proposed frontend contract for the Soil2Action FastAPI backend.
 * Adjust here (and in services/endpoints.ts) to match the final implementation.
 */

export type Language = "en" | "hi";
export type FieldSizeUnit = "acre" | "hectare" | "bigha";

export interface FarmerProfile {
  id?: string;
  name: string;
  state: string;
  district: string;
  phone?: string | null;
}

export interface FieldProfile {
  id: string;
  name: string;
  size: number;
  size_unit: FieldSizeUnit;
  current_crop?: string | null;
  state?: string | null;
  district?: string | null;
  created_at?: string;
}

export type FieldInput = Omit<FieldProfile, "id" | "created_at">;

export interface Micronutrients {
  zinc?: number | null;
  iron?: number | null;
  manganese?: number | null;
  copper?: number | null;
  boron?: number | null;
  sulphur?: number | null;
}

/** Missing optional values are sent as null — never as zero. */
export interface SoilMeasurement {
  ph: number;
  electrical_conductivity: number | null; // dS/m
  organic_carbon: number | null; // %
  nitrogen: number; // kg/ha
  phosphorus: number; // kg/ha
  potassium: number; // kg/ha
  nutrient_unit: "kg/ha";
  micronutrient_unit: "ppm";
  micronutrients: Micronutrients;
  test_date: string; // ISO date
}

export interface SoilAnalysisRequest {
  farmer: FarmerProfile;
  field: {
    id?: string | null;
    name: string;
    size: number;
    size_unit: FieldSizeUnit;
    current_crop: string;
    intended_crop: string | null;
  };
  measurements: SoilMeasurement;
  language: Language;
}

export type ParameterStatus =
  | "very_low"
  | "low"
  | "medium"
  | "optimal"
  | "high"
  | "very_high"
  | "acidic"
  | "neutral"
  | "alkaline"
  | "unknown";

export interface ParameterAssessment {
  key: string;
  label: string;
  value: number | null;
  unit?: string | null;
  status: ParameterStatus;
  explanation?: string | null;
}

export type Priority = "high" | "medium" | "low";

export interface ActionRecommendation {
  id: string;
  priority: Priority;
  title: string;
  reason: string;
  input?: string | null;
  quantity?: number | null;
  unit?: string | null;
  timing?: string | null;
  estimated_cost?: { amount: number; currency: string; note?: string | null } | null;
  cautions?: string[];
}

export interface CropGuidance {
  crop: string;
  suitability: "suitable" | "conditional" | "not_recommended" | "unknown";
  notes: string;
}

export interface SoilAnalysisResponse {
  report_id: string;
  created_at: string;
  overall_assessment: {
    label: string;
    score?: number | null;
    summary: string;
    summary_hi?: string | null;
  };
  parameters: ParameterAssessment[];
  concerns: string[];
  crop_guidance: CropGuidance[];
  recommendations: ActionRecommendation[];
  confidence?: number | null;
  limitations?: string[];
  missing_information?: string[];
  /** Set only by the development mock adapter. */
  is_mock?: boolean;
}

export type ReportStatus = "completed" | "pending" | "failed";

export interface SoilReport {
  report_id: string;
  created_at: string;
  status: ReportStatus;
  field_id?: string | null;
  field_name: string;
  field_size: number;
  field_size_unit: FieldSizeUnit;
  crop: string;
  farmer_name?: string | null;
  measurements?: SoilMeasurement | null;
  request?: SoilAnalysisRequest | null;
  analysis?: SoilAnalysisResponse | null;
  is_mock?: boolean;
}

export interface HistoryQuery {
  search?: string;
  crop?: string;
  field_id?: string;
  status?: ReportStatus;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface HealthResponse {
  status: string;
  version?: string;
}

export type ApiErrorKind = "not_configured" | "network" | "timeout" | "http" | "parse";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  details?: unknown;
  constructor(kind: ApiErrorKind, message: string, status: number | null = null, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.details = details;
  }
}
