import { runGeminiDemo } from './gemini';

const main = async (): Promise<void> => {
  try {
    const summary = await runGeminiDemo(process.argv.slice(2), process.env);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.mode === 'real' && (summary.failures > 0 || summary.telemetry.failedEvents > 0))
      process.exitCode = 1;
  } catch {
    // Never print provider bodies, exception causes, environment values or model output.
    console.error(
      'Gemini example configuration invalid. Read docs/gemini.md; no credentials are printed.',
    );
    process.exitCode = 1;
  }
};

// Importing this module in tests or another application must not start network calls.
if ((import.meta as ImportMeta & { main?: boolean }).main) await main();
