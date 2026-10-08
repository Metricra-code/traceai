import type { TraceEvent } from '@traceai/shared';
import { createBatch } from './batching';
import { resolveConfig, type ResolvedConfig } from './config';
import { createDiagnosticReporter, type ReportDiagnostic } from './diagnostics';
import { captureOperation, classifyError } from './events';
import { BatchTransport } from './transport';
import type { TraceAIConfig, TraceOptions, TraceSpan } from './types';

export type {
  Diagnostic,
  TraceAIConfig,
  TraceMetadata,
  TraceOptions,
  TraceSpan,
  Usage,
} from './types';

const inactiveSpan: TraceSpan = Object.freeze({ setUsage: () => undefined });

/** A best-effort in-memory telemetry client; operation results and errors always win. */
export class TraceAI {
  private readonly config: ResolvedConfig;
  private readonly report: ReportDiagnostic;
  private readonly transport: BatchTransport;
  private readonly interval?: ReturnType<typeof setInterval>;
  private queue: readonly TraceEvent[] = [];
  private inFlightCount = 0;
  private drainPromise?: Promise<void>;
  private drainAllRequested = false;
  private shutdownPromise?: Promise<void>;
  private acceptingTraces = true;
  private activeOperations = new Set<Promise<void>>();

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
    let finish!: () => void;
    const active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.activeOperations = new Set([...this.activeOperations, active]);
    const capture = captureOperation(options, this.report);
    let errorType: TraceEvent['errorType'];
    try {
      return await operation(capture?.span ?? inactiveSpan);
    } catch (error) {
      errorType = classifyError(error);
      throw error;
    } finally {
      this.completeSafely(() => capture?.complete(errorType));
      this.activeOperations = new Set([...this.activeOperations].filter((item) => item !== active));
      finish();
    }
  }

  /** Singleflight: concurrent callers share the same drain until the queue is empty. */
  flush(): Promise<void> {
    if (!this.queue.length && !this.drainPromise) return Promise.resolve();
    this.drainAllRequested = true;
    return this.startDrain();
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

  /** Stops new telemetry, awaits already-started operations, then drains. Idempotent. */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.acceptingTraces = false;
    if (this.interval !== undefined) clearInterval(this.interval);
    this.shutdownPromise = Promise.all([...this.activeOperations]).then(async () => {
      await this.flush();
      // An older drain may have observed an empty queue just before the active barrier.
      while (this.queue.length) await this.flush();
    });
    return this.shutdownPromise;
  }

  private completeSafely(complete: () => TraceEvent | undefined): void {
    try {
      const event = complete();
      if (event) this.enqueue(event);
    } catch {
      this.report({ code: 'invalid_event', count: 1 });
    }
  }

  private enqueue(event: TraceEvent): void {
    if (this.queue.length + this.inFlightCount >= this.config.maxQueueSize) {
      this.report({ code: 'queue_full', count: 1 });
      return;
    }
    this.queue = [...this.queue, event];
    if (this.queue.length >= this.config.batchSize)
      queueMicrotask(() => {
        void this.startDrain();
      });
  }

  private async drainQueue(finish: () => void): Promise<void> {
    try {
      while (this.shouldDrain()) await this.sendNextBatch();
    } catch {
      this.report({ code: 'delivery_failed', count: this.queue.length + this.inFlightCount });
      this.queue = [];
    } finally {
      // Clear state and resolve atomically, without promise-chain gaps that strand new events.
      this.drainPromise = undefined;
      this.drainAllRequested = false;
      finish();
    }
  }

  private async sendNextBatch(): Promise<void> {
    const { events, body } = createBatch(this.queue, this.config.batchSize);
    if (!events.length) {
      this.queue = this.queue.slice(1);
      this.report({ code: 'invalid_event', count: 1 });
      return;
    }
    this.queue = this.queue.slice(events.length);
    this.inFlightCount = events.length;
    try {
      await this.transport.send(body, events.length);
    } finally {
      this.inFlightCount = 0;
    }
  }
}
