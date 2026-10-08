import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { TraceAI, type DeliveryResult, type TraceAIConfig } from '@traceai/sdk';
import { mapGenAISpan, type SpanMappers } from './mapping';

export interface TraceAIExporterOptions extends TraceAIConfig, SpanMappers {
  /** Bound each incoming OTel export call (1..1000), independent of HTTP batch size (<=50). */
  maxExportBatchSize?: number;
}
const resolveOptions = (options: TraceAIExporterOptions) => {
  try {
    const { metadata, errorSummary, maxExportBatchSize = 512, ...sdkConfig } = options;
    if (
      !Number.isInteger(maxExportBatchSize) ||
      maxExportBatchSize < 1 ||
      maxExportBatchSize > 1000 ||
      (metadata !== undefined && typeof metadata !== 'function') ||
      (errorSummary !== undefined && typeof errorSummary !== 'function')
    )
      throw new TypeError();
    return { mappers: { metadata, errorSummary }, maxExportBatchSize, sdkConfig };
  } catch {
    throw new TypeError('Invalid TraceAI exporter configuration');
  }
};
const success: ExportResult = Object.freeze({ code: ExportResultCode.SUCCESS });
const failure = (): ExportResult => ({
  code: ExportResultCode.FAILED,
  error: new Error('TraceAI export failed'),
});
const notifySafely = (callback: (result: ExportResult) => void, result: ExportResult): void => {
  try {
    const returned: unknown = callback(result);
    if (returned && (typeof returned === 'object' || typeof returned === 'function'))
      void Promise.resolve(returned).catch(() => undefined);
  } catch {
    /* OTel callbacks must not escape. */
  }
};

/** Server-side GenAI SpanExporter. Delivery callbacks acknowledge HTTP, not merely enqueueing. */
export class TraceAIExporter implements SpanExporter {
  private readonly client: TraceAI;
  private readonly mappers: SpanMappers;
  private readonly maxExportBatchSize: number;
  private readonly maxPendingSpans: number;
  private readonly pending = new Set<Promise<void>>();
  private pendingSpans = 0;
  private unreportedFailures = 0;
  private accepting = true;
  private flushPromise?: Promise<void>;
  private shutdownPromise?: Promise<void>;

  constructor(options: TraceAIExporterOptions) {
    const { mappers, maxExportBatchSize, sdkConfig } = resolveOptions(options);
    this.client = new TraceAI(sdkConfig);
    this.mappers = mappers;
    this.maxExportBatchSize = maxExportBatchSize;
    this.maxPendingSpans = sdkConfig.maxQueueSize ?? 1000;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (!this.accepting) {
      notifySafely(resultCallback, failure());
      return;
    }
    if (spans.length === 0) {
      notifySafely(resultCallback, success);
      return;
    }
    if (
      spans.length > this.maxExportBatchSize ||
      this.pendingSpans + spans.length > this.maxPendingSpans
    ) {
      this.unreportedFailures++;
      notifySafely(resultCallback, failure());
      return;
    }
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    // Register before running user mappers: reentrant shutdown must wait for this export.
    this.pending.add(completion);
    this.pendingSpans += spans.length;
    const count = spans.length;
    const receipts = this.recordSpans(spans);
    void this.client.flush();
    void Promise.all(receipts)
      .then((results) => {
        const failed = results.some((result) => result.status !== 'delivered');
        if (failed) this.unreportedFailures++;
        notifySafely(resultCallback, failed ? failure() : success);
      })
      .finally(() => {
        this.pendingSpans -= count;
        this.pending.delete(completion);
        finish();
      });
  }

  /** Rejects once for any failed exports since the last flush, with a sanitized error. */
  forceFlush(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.drainExports().finally(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  }

  /** Stops admission, drains accepted exports and closes its private SDK. Idempotent. */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.accepting = false;
    this.shutdownPromise = this.forceFlush().finally(() => this.client.shutdown());
    return this.shutdownPromise;
  }

  private recordSpans(spans: readonly ReadableSpan[]): Promise<DeliveryResult>[] {
    return spans.flatMap((span) => {
      const mapped = mapGenAISpan(span, this.mappers);
      if (mapped.status === 'ignored') return [];
      if (mapped.status === 'invalid')
        return [Promise.resolve<DeliveryResult>({ status: 'dropped', reason: 'invalid_event' })];
      return [this.client.record(mapped.event)];
    });
  }

  private async drainExports(): Promise<void> {
    await this.client.flush();
    while (this.pending.size) await Promise.all([...this.pending]);
    if (!this.unreportedFailures) return;
    this.unreportedFailures = 0;
    throw new Error('TraceAI export failed');
  }
}
