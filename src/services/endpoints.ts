/** Single source of truth for FastAPI endpoint paths. */
export const endpoints = {
  health: "/health",
  analyze: "/api/soil/analyze",
  history: "/api/soil/history",
  report: (id: string) => `/api/soil/history/${encodeURIComponent(id)}`,
  fields: "/api/fields",
  field: (id: string) => `/api/fields/${encodeURIComponent(id)}`,
} as const;
