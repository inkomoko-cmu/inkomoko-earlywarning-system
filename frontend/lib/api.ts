import { clearSession, getSession } from "./session";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ApiError = Error & { status?: number; detail?: string };

function makeError(message: string, status?: number, detail?: string): ApiError {
  const e = new Error(message) as ApiError;
  e.status = status;
  e.detail = detail;
  return e;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  withAuth: boolean = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as any),
  };

  if (withAuth) {
    const s = getSession();
    if (s?.access_token) headers.Authorization = `Bearer ${s.access_token}`;
  }

  let res: Response;

  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    // Network / server down / CORS
    throw makeError("Network error: cannot reach API server.", 0);
  }

  if (res.ok) {
    // If response has no body (204), return null
    if (res.status === 204) return null as unknown as T;
    return (await res.json()) as T;
  }

  // Try parse error body
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.detail ? String(body.detail) : "";
  } catch {
    detail = "";
  }

  // ✅ Auto-logout on 401 when using auth
  if (res.status === 401 && withAuth) {
    clearSession();
    // force to login page (works even if called deep in app)
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw makeError("Session expired. Please sign in again.", 401, detail);
  }

  // Friendly messages
  if (res.status === 403) {
    throw makeError(detail || "Access denied.", 403, detail);
  }
  if (res.status === 400) {
    throw makeError(detail || "Bad request.", 400, detail);
  }
  if (res.status >= 500) {
    throw makeError("Server error. Please try again later.", res.status, detail);
  }

  throw makeError(detail || `Request failed (${res.status}).`, res.status, detail);
}
