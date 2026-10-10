import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { ApiError, api } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('dashboard API cancellation', () => {
  it('preserves an intentional abort rather than reporting an offline failure', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Navigation changed', 'AbortError');
    controller.abort(reason);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(reason));

    await expect(api('demo/traces', { signal: controller.signal })).rejects.toBe(reason);
  });

  it('passes the signal without losing same-origin credentials', async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetch);

    await expect(api('demo/traces', { signal: controller.signal })).resolves.toEqual({
      items: [],
    });
    expect(fetch).toHaveBeenCalledWith('/api/demo/traces', {
      signal: controller.signal,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('still translates a genuine network error to a safe actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network context')));

    await expect(api('demo')).rejects.toMatchObject({
      status: 0,
      message: 'Cannot reach TraceAI. Check your connection and try again.',
    });
  });

  it('cancels obsolete transport when the final query observer leaves', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_path: string, options: RequestInit) => {
        requestSignal = options.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), {
            once: true,
          });
        });
      }),
    );
    const key = ['demo', 'traces', 'obsolete-range'];
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: ({ signal }) => api('demo/traces', { signal }),
    });
    try {
      const unsubscribe = observer.subscribe(() => undefined);
      expect(requestSignal?.aborted).toBe(false);
      unsubscribe();
      expect(requestSignal?.aborted).toBe(true);
      await vi.waitFor(() => {
        expect(client.getQueryState(key)?.fetchStatus).toBe('idle');
        expect(client.getQueryState(key)?.error).toBeNull();
        expect(client.getQueryData(key)).toBeUndefined();
      });
    } finally {
      client.clear();
    }
  });

  it('retains HTTP error status for existing error UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 429 })));

    await expect(api('demo')).rejects.toBeInstanceOf(ApiError);
    await expect(api('demo')).rejects.toMatchObject({ status: 429 });
  });
});
