import { describe, expect, it } from 'vitest';
import { errorSummarySchema, sanitizeErrorSummary } from './error-summary';

describe('explicit error summary privacy boundary', () => {
  it('preserves useful developer-supplied context without inspecting exception objects', () => {
    expect(
      sanitizeErrorSummary('  Provider rejected request; HTTP 429; retry after 30s.\n  '),
    ).toBe('Provider rejected request; HTTP 429; retry after 30s.');
  });
  it('redacts known authentication, ingestion keys, token fields, email and URL credentials', () => {
    const secret = crypto.randomUUID().replaceAll('-', '');
    const key = `tai_${secret}_${secret}${secret}`;
    const text = `Authorization: Bearer ${secret}; api_key="${secret}"; ${key}; user+test@example.test; https://user:${secret}@example.test/path?token=${secret}`;
    const summary = sanitizeErrorSummary(text)!;
    expect(summary).not.toContain(secret);
    expect(summary).not.toContain('user+test@example.test');
    expect(summary).not.toContain('https://user:');
    expect(summary).toContain('[redacted]');
    expect(sanitizeErrorSummary(summary)).toBe(summary);
  });
  it('redacts known provider token and JWT formats', () => {
    const random = crypto.randomUUID().replaceAll('-', '');
    const summary = sanitizeErrorSummary(
      `sk-${random} Bearer ${random} eyJ${random}.${random}.${random}`,
    )!;
    expect(summary).not.toContain(random);
  });
  it('redacts JSON-shaped auth/token fields and username-only URL credentials', () => {
    const secret = crypto.randomUUID();
    const summary = sanitizeErrorSummary(
      `{"apiKey":"${secret}","Authorization":"Bearer ${secret}"} https://${secret}@example.test/`,
    )!;
    expect(summary).not.toContain(secret);
    expect(sanitizeErrorSummary(summary)).toBe(summary);
  });
  it('rejects over-budget summaries instead of truncating potentially sensitive text', () => {
    expect(errorSummarySchema.safeParse('x'.repeat(1000)).success).toBe(true);
    expect(errorSummarySchema.safeParse('x'.repeat(1001)).success).toBe(false);
    expect(sanitizeErrorSummary('x'.repeat(1001))).toBeUndefined();
    expect(sanitizeErrorSummary('漢'.repeat(1000))).toHaveLength(1000);
    expect(sanitizeErrorSummary('   ')).toBeUndefined();
  });
});
