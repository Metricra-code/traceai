import type { TraceEvent } from '@traceai/shared';
export { sanitizeErrorSummary } from '@traceai/shared';
export { snapshotTraceMetadata } from './events';
import { createBatch } from './batching';
import { resolveConfig, type ResolvedConfig } from './config';
import { createDiagnosticReporter, type ReportDiagnostic } from './diagnostics';
import { captureOperation, classifyError, snapshotCompletedEvent } from './events';
import { BatchTransport } from './transport';
import type {
  CompletedTrace,
  DeliveryResult,
  TraceAIConfig,
  TraceOptions,
  TraceSpan,
} from './types';

export type {
  CompletedTrace,
  DeliveryResult,
  Diagnostic,
  TraceAIConfig,
  TraceMetadata,
  TraceOptions,
  TraceSpan,
  Usage,
} from './types';

interface QueuedEvent {
  readonly event: TraceEvent;
  readonly settle?: (result: DeliveryResult) => void;
}
const inactiveSpan: TraceSpan = Object.freeze({ setUsage: () => undefined });
const delivered: DeliveryResult = Object.freeze({ status: 'delivered' });
const deliveryFailed: DeliveryResult = Object.freeze({
  status: 'dropped',
  reason: 'delivery_failed',
});

/** A best-effort in-memory telemetry client; operation results and errors always win. */
export class TraceAI {
  private readonly config: ResolvedConfig;
  private readonly report: ReportDiagnostic;
  private readonly transport: BatchTransport;
  private readonly interval?: ReturnType<typeof setInterval>;
  private queue: readonly QueuedEvent[] = [];
  private inFlightCount = 0;
  private drainPromise?: Promise<void>;
  private drainAllRequested = false;
  private shutdownPromise?: Promise<void>;
  private acceptingTraces = true;
  private activeCount = 0;
  private activeBarrier?: Promise<void>;
  private resolveActiveBarrier?: () => void;

  constructor(config: TraceAIConfig) {
    this.config = resolveConfig(config);
    this.report = createDiagnosticReporter(this.config.onDiagnostic);
    this.transport = new BatchTransport(this.config, this.report);
    if (this.config.enabled) {
      this.interval = setInterval(() => {
        void this.flush();
      }, this.config.flushIntervalMs);
      // Node applications must opt in to draining; background timers must not keep them alive.
      if (typeof this.interval === 'object' && 'unref' in this.interval) this.interval.unref();
    }
  }

  async trace<T>(options: TraceOptions, operation: (span: TraceSpan) => Promise<T>): Promise<T> {
    if (!this.config.enabled) return operation(inactiveSpan);
    if (!this.acceptingTraces) {
      this.report({ code: 'client_closed', count: 1 });
      return operation(inactiveSpan);
    }
    // Constant state, independent of callback concurrency. Register before reentrant diagnostics.
    this.activeCount++;
    const capture = captureOperation(options, this.report);
    let errorType: TraceEvent['errorType'];
    let errorSummary: string | undefined;
    try {
      return await operation(capture?.span ?? inactiveSpan);
    } catch (error) {
      errorType = classifyError(error);
      errorSummary = capture?.summarizeError(error);
      throw error;
    } finally {
      this.completeSafely(() => capture?.complete(errorType, errorSummary));
      this.finishActiveOperation();
    }
  }

  /** Validate and snapshot an already-completed event. Resolves only on delivery or explicit drop. */
  record(event: CompletedTrace): Promise<DeliveryResult> {
    if (!this.config.enabled) return Promise.resolve({ status: 'dropped', reason: 'disabled' });
    if (!this.acceptingTraces) {
      this.report({ code: 'client_closed', count: 1 });
      return Promise.resolve({ status: 'dropped', reason: 'client_closed' });
    }
    const snapshot = snapshotCompletedEvent(event);
    if (!snapshot) {
      this.report({ code: 'invalid_event', count: 1 });
      return Promise.resolve({ status: 'dropped', reason: 'invalid_event' });
    }
    return new Promise((settle) => this.enqueue({ event: snapshot, settle }));
  }

  /** Singleflight best-effort drain. Use record() receipts when acknowledged delivery matters. */
  flush(): Promise<void> {
    if (!this.queue.length && !this.drainPromise) return Promise.resolve();
    this.drainAllRequested = true;
    return this.startDrain();
  }

  /** Stops new telemetry, awaits already-started operations, then drains. Idempotent. */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.acceptingTraces = false;
    if (this.interval !== undefined) clearInterval(this.interval);
    this.shutdownPromise = this.waitForActiveOperations().then(async () => {
      await this.flush();
      // An older drain may have observed an empty queue just before the active barrier.
      while (this.queue.length) await this.flush();
    });
    return this.shutdownPromise;
  }

  private waitForActiveOperations(): Promise<void> {
    if (!this.activeCount) return Promise.resolve();
    this.activeBarrier ??= new Promise((resolve) => {
      this.resolveActiveBarrier = resolve;
    });
    return this.activeBarrier;
  }

  private finishActiveOperation(): void {
    this.activeCount--;
    if (this.activeCount === 0) this.resolveActiveBarrier?.();
  }

  private completeSafely(complete: () => TraceEvent | undefined): void {
    try {
      const event = complete();
      if (event) this.enqueue({ event });
    } catch {
      this.report({ code: 'invalid_event', count: 1 });
    }
  }

  private enqueue(entry: QueuedEvent): void {
    if (this.queue.length + this.inFlightCount >= this.config.maxQueueSize) {
      this.report({ code: 'queue_full', count: 1 });
      entry.settle?.({ status: 'dropped', reason: 'queue_full' });
      return;
    }
    this.queue = [...this.queue, entry];
    if (this.queue.length >= this.config.batchSize)
      queueMicrotask(() => {
        void this.startDrain();
      });
  }

  private startDrain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    if (!this.shouldDrain()) return Promise.resolve();
    let finish!: () => void;
    const draining = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.drainPromise = draining;
    void this.drainQueue(finish);
    return draining;
  }

  private shouldDrain(): boolean {
    return (
      this.queue.length > 0 &&
      (this.drainAllRequested || this.queue.length >= this.config.batchSize)
    );
  }

  private async drainQueue(finish: () => void): Promise<void> {
    try {
      while (this.shouldDrain()) await this.sendNextBatch();
    } catch {
      this.report({ code: 'delivery_failed', count: this.queue.length });
      for (const entry of this.queue) entry.settle?.(deliveryFailed);
      this.queue = [];
    } finally {
      // Clear state and resolve atomically, without promise-chain gaps that strand new events.
      this.drainPromise = undefined;
      this.drainAllRequested = false;
      finish();
    }
  }

  private async sendNextBatch(): Promise<void> {
    const { events, body } = createBatch(
      this.queue.slice(0, this.config.batchSize).map(({ event }) => event),
      this.config.batchSize,
    );
    if (!events.length) {
      this.queue[0]?.settle?.({ status: 'dropped', reason: 'invalid_event' });
      this.queue = this.queue.slice(1);
      this.report({ code: 'invalid_event', count: 1 });
      return;
    }
    const entries = this.queue.slice(0, events.length);
    this.queue = this.queue.slice(events.length);
    this.inFlightCount = entries.length;
    let result = deliveryFailed;
    try {
      if (await this.transport.send(body, entries.length)) result = delivered;
    } finally {
      this.inFlightCount = 0;
      for (const entry of entries) entry.settle?.(result);
    }
  }
}
