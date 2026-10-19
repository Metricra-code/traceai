import { CopyButton } from '@/components/ui/copy-button';

const integration = `import { TraceAI } from '@akai_80percent/traceai-sdk';

const traceai = new TraceAI({
  apiKey: Bun.env.TRACEAI_API_KEY!,
  endpoint: Bun.env.TRACEAI_ENDPOINT!,
});

const result = await traceai.trace(
  { name: 'chat-completion', provider: 'openai', model: 'your-model' },
  async (span) => {
    const response = await callYourModel();
    span.setUsage({
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });
    return response;
  },
);

// Before a short-lived process exits:
await traceai.shutdown();`;

export function SdkSnippet() {
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>Connect the TypeScript SDK</h2>
        <CopyButton value={integration} label="Copy example" />
      </div>
      <p className="muted">
        In this repository: <code>bun install</code>, then run the mock example with environment
        variables. No paid model calls are required.
      </p>
      <pre role="region" aria-label="SDK environment commands" tabIndex={0}>
        {`TRACEAI_API_KEY=<your saved key>\nTRACEAI_ENDPOINT=<your API Worker URL>\n\nbun run demo:node`}
      </pre>
      <pre role="region" aria-label="TypeScript SDK integration example" tabIndex={0}>
        {integration}
      </pre>
      <p className="footnote">
        Telemetry is batched in the background. Operation results and original errors are preserved.
        Explicit usage is provider-specific; adapt those fields to your client.{' '}
        <a href="https://github.com/Metricra-code/traceai/blob/main/docs/sdk.md">
          SDK reliability and installation →
        </a>
      </p>
    </section>
  );
}
