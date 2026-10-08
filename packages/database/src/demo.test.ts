import { describe, expect, it } from 'vitest';
import { traceEventSchema } from '@traceai/shared';
import { createDemoTraces, DEMO_ANCHOR } from './demo';
describe('deterministic simulated demo', () => {
  it('generates 10,000 unique valid requests across 30 days', () => {
    const traces = createDemoTraces();
    expect(traces).toHaveLength(10_000);
    expect(new Set(traces.map((trace) => trace.event.traceId)).size).toBe(10_000);
    expect(traces.every((trace) => traceEventSchema.safeParse(trace.event).success)).toBe(true);
    expect(Date.parse(DEMO_ANCHOR) - Date.parse(traces[0]!.event.startedAt)).toBe(30 * 86_400_000);
  });
  it('does not turn unavailable prices into zero', () => {
    expect(
      createDemoTraces()
        .filter((trace) => trace.event.provider === 'unknown')
        .every((trace) => trace.estimatedCostNanoUsd === null),
    ).toBe(true);
  });
  it('repeats identically and explicitly labels every trace simulated', () => {
    expect(createDemoTraces()).toEqual(createDemoTraces());
    expect(createDemoTraces().every((trace) => trace.event.metadata?.simulated === true)).toBe(
      true,
    );
  });
});
