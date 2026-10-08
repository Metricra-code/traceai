import { z } from 'zod';
import { MAX_BATCH_SIZE } from '@traceai/shared';
import type { TraceAIConfig } from './types';

const milliseconds = z.number().int().min(1).max(3_600_000);
const configSchema = z
  .object({
    apiKey: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^[\x21-\x7e]+$/),
    endpoint: z.string().max(2048),
    enabled: z.boolean().default(true),
    batchSize: z.number().int().min(1).max(MAX_BATCH_SIZE).default(MAX_BATCH_SIZE),
    flushIntervalMs: milliseconds.default(5000),
    requestTimeoutMs: milliseconds.default(5000),
    maxQueueSize: z.number().int().min(1).max(100_000).default(1000),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    retryBaseMs: z.number().int().min(0).max(60_000).default(250),
    retryMaxMs: z.number().int().min(0).max(60_000).default(30_000),
    onDiagnostic: z
      .custom<NonNullable<TraceAIConfig['onDiagnostic']>>((value) => typeof value === 'function')
      .optional(),
    fetch: z.custom<typeof globalThis.fetch>((value) => typeof value === 'function').optional(),
  })
  .strict();

export type ResolvedConfig = ReturnType<typeof resolveConfig>;

const resolveEndpoint = (endpoint: string): string => {
  const url = new URL(endpoint);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash) throw new TypeError();
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new TypeError();
  const base = url.pathname.replace(/\/+$/, '');
  url.pathname = base.endsWith('/v1/events/batch') ? base : `${base}/v1/events/batch`;
  return url.toString();
};

export const resolveConfig = (config: TraceAIConfig) => {
  try {
    const parsed = configSchema.parse(config);
    const fetch = parsed.fetch ?? globalThis.fetch;
    if (typeof fetch !== 'function') throw new TypeError();
    return Object.freeze({ ...parsed, endpoint: resolveEndpoint(parsed.endpoint), fetch });
  } catch {
    // Do not expose Zod issues: rejected values may contain credentials.
    throw new TypeError('Invalid TraceAI configuration');
  }
};
