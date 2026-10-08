import type { ResolvedConfig } from './config';
import type { ReportDiagnostic } from './diagnostics';

interface AttemptResult {
  successful: boolean;
  retryable: boolean;
  httpStatus?: number;
  retryAfterMs?: number;
}

const retryAfterDelay = (header: string | null, maximum: number): number => {
  if (!header) return 0;
  const seconds = Number(header);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(duration) ? Math.min(maximum, Math.max(0, duration)) : 0;
};

const waitForRetry = (
  result: AttemptResult,
  attempt: number,
  config: ResolvedConfig,
): Promise<void> => {
  const exponentialCap = Math.min(config.retryMaxMs, config.retryBaseMs * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * exponentialCap);
  const delay = Math.max(jitter, result.retryAfterMs ?? 0);
  return delay > 0 ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
};

export class BatchTransport {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly report: ReportDiagnostic,
  ) {}

  async send(body: string, count: number): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const result = await this.sendAttempt(body);
      if (result.successful) return;
      const detail = {
        count,
        attempt,
        ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }),
      };
      if (!result.retryable || attempt === this.config.maxAttempts) {
        this.report({ code: 'delivery_failed', ...detail });
        return;
      }
      this.report({ code: 'delivery_retry', ...detail });
      await waitForRetry(result, attempt, this.config);
    }
  }

  private async sendAttempt(body: string): Promise<AttemptResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Telemetry request timed out'));
        }, this.config.requestTimeoutMs);
      });
      const request = this.config.fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      const response = await Promise.race([request, timeout]);
      // No response/error body is read: it may contain server or credential details.
      void response.body?.cancel().catch(() => undefined);
      return {
        successful: response.ok,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          (response.status >= 500 && response.status <= 599),
        httpStatus: response.status,
        retryAfterMs: retryAfterDelay(response.headers.get('Retry-After'), this.config.retryMaxMs),
      };
    } catch {
      return { successful: false, retryable: true };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
