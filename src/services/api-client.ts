import { env } from "@/config/env";
import { ApiError } from "@/types/api";

type TokenProvider = () => Promise<string | null> | string | null;
let tokenProvider: TokenProvider | null = null;

/** Hook for a future identity provider (e.g. Supabase Auth). The backend must verify the token. */
export function setAuthTokenProvider(fn: TokenProvider | null) {
  tokenProvider = fn;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  timeoutMs?: number;
}

function extractMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d["detail"] === "string") return d["detail"];
    if (Array.isArray(d["detail"]) && d["detail"].length) {
      const first = d["detail"][0] as { msg?: string; loc?: unknown[] };
      if (first?.msg) return `${first.loc ? first.loc.join(".") + ": " : ""}${first.msg}`;
    }
    if (typeof d["message"] === "string") return d["message"];
  }
  return fallback;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!env.apiBaseUrl) {
    throw new ApiError("not_configured", "VITE_API_BASE_URL is not set");
  }
  const url = new URL(env.apiBaseUrl + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? 30000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
      signal: controller.signal,
    });
  } catch (e) {
    if (timedOut) throw new ApiError("timeout", "Request timed out");
    throw new ApiError("network", e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiError("parse", "Server returned invalid JSON", res.status);
    }
  }
  if (!res.ok) {
    throw new ApiError("http", extractMessage(data, res.statusText || "Request failed"), res.status, data);
  }
  return data as T;
}
