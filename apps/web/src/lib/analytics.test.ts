import { describe, expect, it } from 'vitest';
import { providerVolumes } from './analytics';

describe('provider volume aggregation', () => {
  it('preserves request totals and first-seen provider order without mutating inputs', () => {
    const input = Object.freeze([
      Object.freeze({ provider: 'google', totalRequests: 2 }),
      Object.freeze({ provider: 'local', totalRequests: 0 }),
      Object.freeze({ provider: 'google', totalRequests: 3 }),
      Object.freeze({ provider: 'openai', totalRequests: 7 }),
    ]);
    expect(providerVolumes(input)).toEqual([
      { provider: 'google', requests: 5 },
      { provider: 'local', requests: 0 },
      { provider: 'openai', requests: 7 },
    ]);
  });

  it('returns no fabricated groups for an empty window', () => {
    expect(providerVolumes([])).toEqual([]);
  });

  it('handles arbitrary accepted labels without object-prototype keys', () => {
    expect(
      providerVolumes([
        { provider: '__proto__', totalRequests: 1 },
        { provider: 'constructor', totalRequests: 2 },
        { provider: '__proto__', totalRequests: 3 },
      ]),
    ).toEqual([
      { provider: '__proto__', requests: 4 },
      { provider: 'constructor', requests: 2 },
    ]);
  });

  it('reads each provider once at the maximum analytics row count', () => {
    let reads = 0;
    const input = Array.from({ length: 20_000 }, (_, index) => ({
      get provider() {
        reads++;
        return `provider-${index}`;
      },
      totalRequests: 1,
    }));
    const groups = providerVolumes(input);
    expect(groups).toHaveLength(20_000);
    expect(reads).toBe(20_000);
    expect(groups.reduce((sum, item) => sum + item.requests, 0)).toBe(20_000);
  });
});
