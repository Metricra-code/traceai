import { chromium, type Page } from '@playwright/test';
import { percentile } from '../packages/shared/src/index';

const url = new URL(process.env.TRACEAI_DASHBOARD_URL ?? 'http://localhost:3000/demo');
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.pathname !== '/demo' ||
  url.search ||
  url.hash
)
  throw new Error('Use a credential-free HTTP(S) URL ending in /demo.');
const samples = Number(process.env.TRACEAI_BENCHMARK_SAMPLES ?? 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 10)
  throw new Error('Use between 1 and 10 samples to limit public-demo reads.');

async function measure(page: Page) {
  const started = performance.now();
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`Dashboard: HTTP ${response?.status() ?? 'unavailable'}`);
  await page.getByTestId('total-requests').waitFor();
  await page.getByTestId('p95-latency').waitFor();
  await page.waitForFunction(() => {
    const panels = Array.from(document.querySelectorAll('.chart-panel'));
    return (
      panels.length >= 6 &&
      panels.every((panel) => {
        const bounds = panel.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      }) &&
      document.querySelectorAll('.recharts-surface').length >= 5
    );
  });
  const usableOverviewMs = Math.round(performance.now() - started);
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      timeToFirstByteMs: entry ? Math.round(entry.responseStart) : null,
      domContentLoadedMs: entry ? Math.round(entry.domContentLoadedEventEnd) : null,
      firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
    };
  });
  return { usableOverviewMs, ...navigation };
}

const browser = await chromium.launch();
try {
  const measurements: {
    coldBrowserCache: Awaited<ReturnType<typeof measure>>;
    warmBrowserCache: Awaited<ReturnType<typeof measure>>;
  }[] = [];
  for (let index = 0; index < samples; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const coldBrowserCache = await measure(page);
      const warmBrowserCache = await measure(page);
      measurements.push({ coldBrowserCache, warmBrowserCache });
    } finally {
      await context.close();
    }
  }
  const summary = (mode: 'coldBrowserCache' | 'warmBrowserCache') => {
    const sorted = measurements.map((item) => item[mode].usableOverviewMs).sort((a, b) => a - b);
    return {
      samples,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maximumMs: sorted.at(-1),
      samplesUnderTarget: sorted.filter((time) => time < 3000).length,
    };
  };
  console.log(
    JSON.stringify(
      {
        url: url.href,
        measuredAt: new Date().toISOString(),
        browser: `Chromium ${browser.version()}`,
        viewport: '1440x1040',
        scope:
          'Read-only default 7-day simulated demo. Unthrottled client connection/CPU. Usable means total/P95 visible, six chart panels sized and five SVG charts rendered. Fresh browser context is not proof of a cold edge Worker. Warm run reuses browser HTTP cache, not Next client navigation. Includes network, hydration and API waterfall; not an SLA or universal <3s claim.',
        summary: {
          coldBrowserCache: summary('coldBrowserCache'),
          warmBrowserCache: summary('warmBrowserCache'),
        },
        measurements,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
