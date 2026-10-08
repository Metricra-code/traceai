import { TraceAI } from '../packages/sdk/src/index';
import { randomUUID } from 'node:crypto';

const web = process.env.TRACEAI_WEB_URL ?? 'https://traceai-web.traceai-api.workers.dev';
const endpoint = process.env.TRACEAI_ENDPOINT ?? 'https://traceai-api.traceai-api.workers.dev';
const suffix = randomUUID();
let cookie = '';
let projectId = '';
let projectName = '';
let verificationError: unknown;
let report: Record<string, unknown> | undefined;
async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${web}/api/${path}`, {
    method,
    headers: {
      Origin: web,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  const session = response.headers.get('set-cookie');
  if (session) {
    if (!/httponly/i.test(session) || !/secure/i.test(session) || !/samesite=lax/i.test(session))
      throw new Error('Production cookie security attributes missing');
    cookie = session.split(';')[0]!;
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
function check(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}
try {
  await call('auth/register', 'POST', {
    email: `deployment-${suffix}@example.com`,
    password: `Unique-deployment-${randomUUID()}`,
  });
  projectName = `Deployment check ${suffix.slice(0, 8)}`;
  const project = await call<{ id: string }>('projects', 'POST', {
    name: projectName,
    description: 'Disposable live SDK verification',
  });
  projectId = project.id;
  const base = `projects/${projectId}`;
  const created = await call<{ apiKey: { id: string }; key: string }>(`${base}/api-keys`, 'POST');
  const sdk = new TraceAI({ apiKey: created.key, endpoint });
  const result = await sdk.trace(
    { name: 'deployment-success', provider: 'local', model: 'mock-model' },
    async (span) => {
      span.setUsage({ inputTokens: 1200, outputTokens: 350 });
      return 'original-result';
    },
  );
  check(result === 'original-result', 'SDK changed the operation result');
  const original = new Error('Do not collect this private error');
  try {
    await sdk.trace(
      { name: 'deployment-failure', provider: 'local', model: 'mock-model' },
      async () => {
        throw original;
      },
    );
  } catch (error) {
    check(error === original, 'SDK changed original error');
  }
  await sdk.shutdown();
  const query = new URLSearchParams({
    from: new Date(Date.now() - 86_400_000).toISOString(),
    to: new Date(Date.now() + 60_000).toISOString(),
  });
  const overview = await call<{
    totalRequests: number;
    failedRequests: number;
    estimatedCostNanoUsd: string | null;
  }>(`${base}/overview?${query}`);
  check(
    overview.totalRequests === 2 && overview.failedRequests === 1,
    'Live SDK telemetry not persisted correctly',
  );
  check(overview.estimatedCostNanoUsd === null, 'Unknown pricing was substituted');
  const traces = await call<{
    items: Array<{
      traceId: string;
      name: string;
      provider: string;
      model: string;
      status: string;
      startedAt: string;
      endedAt: string;
      durationMs: number;
    }>;
  }>(`${base}/traces?${query}`);
  const trace = traces.items[0]!;
  const event = {
    traceId: trace.traceId,
    name: trace.name,
    provider: trace.provider,
    model: trace.model,
    status: trace.status,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
    durationMs: trace.durationMs,
  };
  const replay = await fetch(`${endpoint}/v1/events/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.key}` },
    body: JSON.stringify({ events: [event] }),
  });
  check(replay.status === 202, 'Duplicate replay failed');
  const counts = (await replay.json()) as { accepted: number; duplicates: number };
  check(counts.accepted === 0 && counts.duplicates === 1, 'Duplicate replay was not idempotent');
  await call(`${base}/api-keys/${created.apiKey.id}`, 'DELETE');
  const rejected = await fetch(`${endpoint}/v1/events/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.key}` },
    body: JSON.stringify({ events: [event] }),
  });
  check(rejected.status === 401, 'Revoked key still accepted');
  report = {
    verified: true,
    web,
    endpoint,
    checks: [
      'Secure HttpOnly session',
      'project creation',
      'real SDK success/error preservation',
      'D1 persistence',
      'unknown price null',
      'idempotent replay',
      'key revocation',
    ],
    requests: 2,
  };
} catch (error) {
  verificationError = error;
} finally {
  try {
    if (projectId && cookie)
      await call(`projects/${projectId}`, 'DELETE', { confirmName: projectName });
    if (cookie) await call('auth/logout', 'POST');
  } catch (error) {
    if (!verificationError) verificationError = error;
    else console.warn('Disposable deployment verification cleanup was incomplete.');
  }
}

if (verificationError) throw verificationError;
console.log(JSON.stringify(report));
