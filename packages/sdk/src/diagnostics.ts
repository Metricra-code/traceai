import type { Diagnostic, TraceAIConfig } from './types';

export type ReportDiagnostic = (diagnostic: Diagnostic) => void;

export const createDiagnosticReporter =
  (callback?: TraceAIConfig['onDiagnostic']): ReportDiagnostic =>
  (diagnostic) => {
    try {
      const returned: unknown = callback?.(Object.freeze({ ...diagnostic }));
      // TypeScript permits async callbacks where void is expected. Swallow those too.
      if (returned !== undefined) void Promise.resolve(returned).catch(() => undefined);
    } catch {
      // An optional observer must never become part of the application's error path.
    }
  };
