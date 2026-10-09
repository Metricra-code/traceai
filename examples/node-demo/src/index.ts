import { TraceAI } from '@akai_80percent/traceai-sdk';
import { setTimeout } from 'node:timers/promises';

const apiKey = process.env.TRACEAI_API_KEY;
if (!apiKey)
  throw new Error(
    'Set TRACEAI_API_KEY to a newly generated project ingestion key. Never commit it.',
  );

const traceai = new TraceAI({
  apiKey,
  endpoint: process.env.TRACEAI_ENDPOINT ?? 'http://localhost:8787',
  onDiagnostic: (diagnostic) => console.warn('TraceAI telemetry:', diagnostic),
});

try {
  const answer = await traceai.trace(
    {
      name: 'simulated-summary',
      provider: 'example',
      model: 'simulated-model-v1',
      metadata: { feature: 'node-example', simulated: true },
    },
    async (span) => {
      await setTimeout(125);
      span.setUsage({ inputTokens: 1200, outputTokens: 350 });
      return { summary: 'A locally simulated response; no AI provider was contacted.' };
    },
  );
  console.log(answer.summary);
  try {
    await traceai.trace(
      {
        name: 'simulated-failure',
        provider: 'example',
        model: 'simulated-model-v1',
        metadata: { simulated: true },
      },
      async () => {
        await setTimeout(30);
        throw new Error('A simulated application failure; this message is not collected.');
      },
    );
  } catch {
    console.log('The original simulated failure was preserved.');
  }
} finally {
  // Do not use process.exit(): wait for the bounded telemetry attempts to finish.
  await traceai.shutdown();
}
