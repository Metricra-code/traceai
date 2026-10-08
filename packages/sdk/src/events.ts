import { metadataSchema, traceEventSchema, usageSchema, type TraceEvent } from '@traceai/shared';
import type { ReportDiagnostic } from './diagnostics';
import type { TraceOptions, TraceSpan, Usage } from './types';

export interface OperationCapture {
  span: TraceSpan;
  complete(errorType?: TraceEvent['errorType']): TraceEvent | undefined;
}

const snapshotOptions = (options: TraceOptions, report: ReportDiagnostic) => {
  const labels = { name: options.name, provider: options.provider, model: options.model };
  if (options.metadata === undefined) return labels;
  try {
    const metadata = metadataSchema.parse(options.metadata);
    return { ...labels, metadata };
  } catch {
    report({ code: 'invalid_metadata', count: 1 });
    return labels;
  }
};

export const classifyError = (error: unknown): NonNullable<TraceEvent['errorType']> => {
  try {
    if (typeof error !== 'object' || error === null) return 'unknown';
    const classified = error as { name?: unknown; status?: unknown; code?: unknown };
    if (
      classified.name === 'AbortError' ||
      classified.name === 'TimeoutError' ||
      classified.code === 'ETIMEDOUT'
    )
      return 'timeout';
    if (classified.status === 429) return 'rate_limit';
    if (
      classified.name === 'NetworkError' ||
      (typeof classified.code === 'string' &&
        ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'].includes(classified.code))
    )
      return 'network';
    return error instanceof Error ? 'application' : 'unknown';
  } catch {
    return 'unknown';
  }
};

export const captureOperation = (
  options: TraceOptions,
  report: ReportDiagnostic,
): OperationCapture | undefined => {
  try {
    const labels = snapshotOptions(options, report);
    const traceId = globalThis.crypto.randomUUID();
    const startedAtMs = Date.now();
    const monotonicStart = performance.now();
    let usage: Usage | undefined;
    let closed = false;
    const span: TraceSpan = {
      setUsage(value) {
        if (closed) return;
        try {
          usage = usageSchema.parse(value);
        } catch {
          report({ code: 'invalid_usage', count: 1 });
        }
      },
    };
    return {
      span,
      complete(errorType) {
        closed = true;
        const event = traceEventSchema.safeParse({
          ...labels,
          traceId,
          status: errorType === undefined ? 'success' : 'error',
          startedAt: new Date(startedAtMs).toISOString(),
          endedAt: new Date(Math.max(startedAtMs, Date.now())).toISOString(),
          durationMs: Math.max(0, performance.now() - monotonicStart),
          ...usage,
          ...(errorType === undefined ? {} : { errorType }),
        });
        if (event.success) return event.data;
        report({ code: 'invalid_event', count: 1 });
        return undefined;
      },
    };
  } catch {
    report({ code: 'invalid_event', count: 1 });
    return undefined;
  }
};
