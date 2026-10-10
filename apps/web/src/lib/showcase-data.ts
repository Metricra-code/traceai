import type { RecordedCall } from './showcase';

// Owner-approved operational projection, read back from D1; no private identifiers or content.
export const recordedCalls = [
  {
    model: 'gemini-3.5-flash-lite',
    durationMs: 1286.598375,
    inputTokens: 10,
    outputTokens: 23,
    status: 'success',
  },
  {
    model: 'gemini-3.5-flash-lite',
    durationMs: 1137.5750420000002,
    inputTokens: 10,
    outputTokens: 28,
    status: 'success',
  },
  {
    model: 'gemini-3.5-flash-lite',
    durationMs: 671.828917,
    inputTokens: 11,
    outputTokens: 30,
    status: 'success',
  },
] as const satisfies readonly RecordedCall[];
