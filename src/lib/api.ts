'use client';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
  }
}

/** POST to a participant API action and return parsed JSON or throw ApiError. */
export async function api<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/participant/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 'NETWORK', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Request failed.', data.code ?? 'ERROR', res.status);
  return data as T;
}
