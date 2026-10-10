import type { ModelComparison } from '@traceai/shared';

export function providerVolumes(
  items: readonly Pick<ModelComparison, 'provider' | 'totalRequests'>[],
): { provider: string; requests: number }[] {
  const totals = new Map<string, number>();
  for (const { provider, totalRequests } of items)
    totals.set(provider, (totals.get(provider) ?? 0) + totalRequests);
  return Array.from(totals, ([provider, requests]) => ({ provider, requests }));
}
