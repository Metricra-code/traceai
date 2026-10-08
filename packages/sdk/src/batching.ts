import { MAX_PAYLOAD_BYTES, type TraceEvent } from '@traceai/shared';

export const createBatch = (queue: readonly TraceEvent[], batchSize: number) => {
  let events: readonly TraceEvent[] = [];
  let body = '';
  for (const event of queue.slice(0, batchSize)) {
    const candidate = [...events, event];
    const encoded = JSON.stringify({ events: candidate });
    if (new TextEncoder().encode(encoded).length > MAX_PAYLOAD_BYTES) break;
    events = candidate;
    body = encoded;
  }
  return { events, body };
};
