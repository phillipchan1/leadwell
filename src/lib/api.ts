/** Same-origin Worker API. Cookies carry the Better Auth session. */

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
}

export function apiGet(path: string): Promise<Response> {
  return apiFetch(path, { method: "GET" });
}

export function apiPut(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiPatch(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete(path: string): Promise<Response> {
  return apiFetch(path, { method: "DELETE" });
}

export async function readApiError(res: Response, prefix: string): Promise<never> {
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body && typeof body.error === "string" && body.error.trim()) {
      message = body.error;
    }
  } catch {
    /* ignore non-JSON */
  }
  throw new Error(`${prefix}: ${message}`);
}
