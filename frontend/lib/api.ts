/** Every browser API operation has a deadline and cancels cleanly on navigation. */
export class ApiError extends Error {
  constructor(public status: number) { super(`API request failed (${status})`); }
}

export async function requestJSON<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 10_000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new ApiError(response.status);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
