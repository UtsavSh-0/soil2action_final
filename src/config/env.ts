const rawBase = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";

export const env = {
  apiBaseUrl: rawBase.trim().replace(/\/+$/, ""),
  isDev: import.meta.env.DEV,
};

const MOCK_KEY = "s2a.mockApi";

/** Mock adapter is development-only. Enabled via VITE_USE_MOCK_API or a dev toggle. */
export function isMockEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env["VITE_USE_MOCK_API"] === "true") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MOCK_KEY) === "1";
}

export function setMockEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(MOCK_KEY, "1");
  else window.localStorage.removeItem(MOCK_KEY);
}
