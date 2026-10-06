export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error || res.statusText);
  return data as T;
}

export function authHeaders(adminKey: string): HeadersInit {
  return adminKey ? { authorization: `Bearer ${adminKey}` } : {};
}

/** Sends one image. Profile photos and the business logo stay under 2 MB. */
export async function uploadImage<T>(path: string, file: File, method = "POST"): Promise<T> {
  const headers = new Headers({
    "content-type": file.type || "application/octet-stream",
    "x-filename": file.name,
  });
  const res = await fetch(path, { method, headers, body: file, credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error || res.statusText);
  return data;
}
