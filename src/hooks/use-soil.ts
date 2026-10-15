import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { soilApi } from "@/services/soil-api";
import type { FieldInput, HistoryQuery, SoilAnalysisRequest } from "@/types/api";

export const qk = {
  health: ["health"] as const,
  history: (q: HistoryQuery) => ["history", q] as const,
  report: (id: string) => ["report", id] as const,
  fields: ["fields"] as const,
};

export const useHealth = () =>
  useQuery({ queryKey: qk.health, queryFn: soilApi.health, retry: false, staleTime: 30_000 });

export const useHistory = (q: HistoryQuery = {}) =>
  useQuery({ queryKey: qk.history(q), queryFn: () => soilApi.history(q), retry: 1 });

export const useReport = (id: string) =>
  useQuery({ queryKey: qk.report(id), queryFn: () => soilApi.report(id), retry: 1 });

export const useFields = () => useQuery({ queryKey: qk.fields, queryFn: soilApi.fields, retry: 1 });

export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SoilAnalysisRequest) => soilApi.analyze(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["history"] }),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => soilApi.deleteReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["history"] }),
  });
}

export function useSaveField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: FieldInput }) =>
      id ? soilApi.updateField(id, input) : soilApi.createField(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.fields }),
  });
}
