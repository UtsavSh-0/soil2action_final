import { isMockEnabled } from "@/config/env";
import type {
  FieldInput,
  FieldProfile,
  HealthResponse,
  HistoryQuery,
  Paginated,
  SoilAnalysisRequest,
  SoilAnalysisResponse,
  SoilReport,
} from "@/types/api";
import { apiRequest } from "./api-client";
import { endpoints } from "./endpoints";
import { mockApi } from "./mock-adapter";

export interface ScanField {
  value: string | number | null;
  unit?: string | null;
  confidence?: number | null;
  confirmed?: boolean;
  source?: string | null;
  review_status?: "missing" | "uncertain" | "needs_review" | "confirmed";
}
export interface ScanJob {
  scan_id: string;
  status: string;
  filename: string;
  detected_file_type: string;
  extracted_fields: Record<string, ScanField>;
  warnings: string[];
  raw_text?: string | null;
  requires_user_review: boolean;
  created_at?: string;
}

/** Accept either a paginated envelope or a bare array from the backend. */
function normalizeList<T>(data: Paginated<T> | T[] | null, q: HistoryQuery): Paginated<T> {
  if (Array.isArray(data)) return { items: data, total: data.length, page: q.page ?? 1, page_size: data.length };
  if (data && Array.isArray(data.items)) return data;
  return { items: [], total: 0, page: 1, page_size: 0 };
}

export const soilApi = {
  health: (): Promise<HealthResponse> =>
    isMockEnabled() ? mockApi.health() : apiRequest<HealthResponse>(endpoints.health, { timeoutMs: 8000 }),

  analyze: (req: SoilAnalysisRequest): Promise<SoilAnalysisResponse> =>
    isMockEnabled()
      ? mockApi.analyze(req)
      : apiRequest<SoilAnalysisResponse>(endpoints.analyze, { method: "POST", body: req, timeoutMs: 60000 }),

  history: async (q: HistoryQuery = {}): Promise<Paginated<SoilReport>> => {
    if (isMockEnabled()) return mockApi.history(q);
    const data = await apiRequest<Paginated<SoilReport> | SoilReport[]>(endpoints.history, {
      query: { ...q } as Record<string, string | number | undefined>,
    });
    return normalizeList(data, q);
  },

  report: (id: string): Promise<SoilReport> =>
    isMockEnabled() ? mockApi.report(id) : apiRequest<SoilReport>(endpoints.report(id)),

  deleteReport: async (id: string): Promise<void> => {
    if (isMockEnabled()) return mockApi.deleteReport(id);
    await apiRequest<unknown>(endpoints.report(id), { method: "DELETE" });
  },

  fields: async (): Promise<FieldProfile[]> => {
    if (isMockEnabled()) return mockApi.fields();
    const data = await apiRequest<FieldProfile[] | { items: FieldProfile[] }>(endpoints.fields);
    return Array.isArray(data) ? data : (data?.items ?? []);
  },

  createField: (input: FieldInput): Promise<FieldProfile> =>
    isMockEnabled() ? mockApi.createField(input) : apiRequest<FieldProfile>(endpoints.fields, { method: "POST", body: input }),

  updateField: (id: string, input: FieldInput): Promise<FieldProfile> =>
    isMockEnabled()
      ? mockApi.updateField(id, input)
      : apiRequest<FieldProfile>(endpoints.field(id), { method: "PUT", body: input }),

  scan: (file: File): Promise<ScanJob> => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest<ScanJob>(endpoints.scan, { method: "POST", body: form, timeoutMs: 120000 });
  },
  scanJob: (id: string): Promise<ScanJob> => apiRequest<ScanJob>(endpoints.scanJob(id)),
  confirmScan: (id: string, fields: Record<string, ScanField>): Promise<ScanJob> => {
    const reviewed = Object.fromEntries(Object.entries(fields).filter(([, field]) => field.value != null && String(field.value).trim() !== ""));
    return apiRequest<ScanJob>(endpoints.confirmScan(id), { method: "POST", body: { extracted_fields: reviewed, confirmed: true } });
  },
};
