/** Single source of truth for FastAPI endpoint paths. */
export const endpoints = {
  health: "/health",
  analyze: "/api/soil/analyze",
  history: "/api/soil/history",
  report: (id: string) => `/api/soil/history/${encodeURIComponent(id)}`,
  fields: "/api/fields",
  field: (id: string) => `/api/fields/${encodeURIComponent(id)}`,
  scan: "/api/soil/scan",
  scanJob: (id: string) => `/api/soil/scan/${encodeURIComponent(id)}`,
  confirmScan: (id: string) => `/api/soil/scan/${encodeURIComponent(id)}/confirm`,
} as const;
