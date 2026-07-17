const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalized}` : normalized;
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const preview = text.trim().slice(0, 120);
    throw new Error(`Expected JSON from ${path}, got ${contentType || "unknown content type"}: ${preview}`);
  }

  const data = JSON.parse(text) as T;
  if (!res.ok) {
    const maybeError = data as { error?: string; detail?: string };
    throw new Error(maybeError.detail ?? maybeError.error ?? `Request failed with ${res.status}`);
  }
  return data;
}
