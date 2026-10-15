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
};
