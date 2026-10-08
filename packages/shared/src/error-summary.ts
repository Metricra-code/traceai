import { z } from 'zod';

export const MAX_ERROR_SUMMARY_CHARS = 1000;
export const MAX_ERROR_SUMMARY_BYTES = 4 * 1024;
export const ERROR_CAPTURE_POLICY = 'explicit-summary-v1';
export const errorSummarySchema = z
  .string()
  .min(1)
  .max(MAX_ERROR_SUMMARY_CHARS)
  .refine((value) => new TextEncoder().encode(value).length <= MAX_ERROR_SUMMARY_BYTES);

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
}

/** Best-effort known-pattern redaction, not a guarantee that arbitrary summaries contain no PII. */
export function sanitizeErrorSummary(value: string): string | undefined {
  if (!errorSummarySchema.safeParse(value).success) return undefined;
  const sanitized = stripControlCharacters(value)
    .replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[redacted]@')
    .replace(
      /\b(?:authorization|proxy-authorization)["']?\s*[:=]\s*["']?(?:bearer\s+|basic\s+)?[^\s,;"'}]+/gi,
      'authorization: [redacted]',
    )
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/gi, '[redacted-auth]')
    .replace(/\btai_[a-f0-9]{32}_[a-f0-9]{64}\b/gi, '[redacted-key]')
    .replace(
      /\b(?:sk|sess|ghp|gho|github_pat|xox[baprs])[-_][a-z0-9_-]{12,}\b/gi,
      '[redacted-token]',
    )
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, '[redacted-token]')
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|signature)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      '$1=[redacted]',
    )
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '[redacted-email]')
    .trim();
  return sanitized && errorSummarySchema.safeParse(sanitized).success ? sanitized : undefined;
}
