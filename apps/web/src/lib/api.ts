export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
  } catch {
    options?.signal?.throwIfAborted();
    throw new ApiError(0, 'Cannot reach TraceAI. Check your connection and try again.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'The request could not be completed.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const integer = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const latency = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
export function cost(nanoUsd: string | null): string {
  if (nanoUsd === null) return 'Pricing unavailable';
  // Presentation only: authoritative amounts remain integer nanodollar strings.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number(nanoUsd) / 1e9);
}
export const utc = (value: string) =>
  new Date(value)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
