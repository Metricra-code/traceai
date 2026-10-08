import { isSpanContextValid, SpanStatusCode, type HrTime } from '@opentelemetry/api';
import { hrTimeToMilliseconds, hrTimeToTimeStamp } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  sanitizeErrorSummary,
  snapshotTraceMetadata,
  type CompletedTrace,
  type TraceMetadata,
} from '@traceai/sdk';

export interface SpanMappers {
  /** Only explicitly returned scalar metadata is captured, subject to the SDK's 8 KiB limit. */
  metadata?: (span: ReadableSpan) => TraceMetadata | undefined;
  /** Failure-only opt-in. Never reads status descriptions, events or exception messages itself. */
  errorSummary?: (span: ReadableSpan) => string | undefined;
}
export type MappedSpan =
  { status: 'ignored' } | { status: 'invalid' } | { status: 'mapped'; event: CompletedTrace };

const label = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120
    ? value.trim()
    : undefined;
const tokenCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000_000
    ? value
    : undefined;
const validTime = (time: HrTime): boolean =>
  Array.isArray(time) &&
  time.length === 2 &&
  Number.isSafeInteger(time[0]) &&
  time[0] >= 0 &&
  Number.isInteger(time[1]) &&
  time[1] >= 0 &&
  time[1] < 1_000_000_000;
const errorCategory = (value: unknown): NonNullable<CompletedTrace['errorType']> => {
  if (value === 'timeout' || value === 'TimeoutError' || value === 'ETIMEDOUT') return 'timeout';
  if (value === 'rate_limit' || value === '429') return 'rate_limit';
  if (value === 'network' || value === 'NetworkError') return 'network';
  if (value === 'application') return 'application';
  return 'unknown';
};
const explicitValue = <T>(
  mapper: ((span: ReadableSpan) => T) | undefined,
  span: ReadableSpan,
): T | undefined => {
  try {
    const value = mapper?.(span);
    if (value && typeof value === 'object') void Promise.resolve(value).catch(() => undefined);
    return value;
  } catch {
    return undefined;
  }
};
const explicitSummary = (mapper: SpanMappers['errorSummary'], span: ReadableSpan) => {
  const value: unknown = explicitValue(mapper, span);
  return typeof value === 'string' ? sanitizeErrorSummary(value) : undefined;
};

/** Deliberately never copies span.name, resource, events, links or arbitrary attributes. */
export const mapGenAISpan = (span: ReadableSpan, mappers: SpanMappers): MappedSpan => {
  try {
    const attributes = span.attributes;
    if (attributes['gen_ai.operation.name'] === undefined) return { status: 'ignored' };
    const name = label(attributes['gen_ai.operation.name']);
    const provider = label(attributes['gen_ai.provider.name']);
    const model =
      label(attributes['gen_ai.response.model']) ?? label(attributes['gen_ai.request.model']);
    const context = span.spanContext();
    if (!name || !provider || !model || !span.ended || !isSpanContextValid(context))
      return { status: 'invalid' };
    if (!validTime(span.startTime) || !validTime(span.endTime) || !validTime(span.duration))
      return { status: 'invalid' };
    if (
      span.endTime[0] < span.startTime[0] ||
      (span.endTime[0] === span.startTime[0] && span.endTime[1] < span.startTime[1])
    )
      return { status: 'invalid' };
    const failed = span.status.code === SpanStatusCode.ERROR;
    const inputTokens = tokenCount(attributes['gen_ai.usage.input_tokens']);
    const outputTokens = tokenCount(attributes['gen_ai.usage.output_tokens']);
    const errorSummary = failed ? explicitSummary(mappers.errorSummary, span) : undefined;
    const identifiers = { otelTraceId: context.traceId, otelSpanId: context.spanId };
    const metadata =
      snapshotTraceMetadata({
        ...snapshotTraceMetadata(explicitValue(mappers.metadata, span)),
        ...identifiers,
      }) ?? identifiers;
    return {
      status: 'mapped',
      event: {
        traceId: `otel_${context.traceId}_${context.spanId}`,
        name,
        provider,
        model,
        status: failed ? 'error' : 'success',
        startedAt: hrTimeToTimeStamp(span.startTime),
        endedAt: hrTimeToTimeStamp(span.endTime),
        durationMs: hrTimeToMilliseconds(span.duration),
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
        ...(failed ? { errorType: errorCategory(attributes['error.type']) } : {}),
        ...(errorSummary === undefined ? {} : { errorSummary }),
        metadata,
      },
    };
  } catch {
    return { status: 'invalid' };
  }
};
