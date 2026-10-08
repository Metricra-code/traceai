import { getCloudflareContext } from '@opennextjs/cloudflare';
export const dynamic = 'force-dynamic';
const allowedPath =
  /^(?:auth\/(?:register|login|logout|session)|projects(?:\/[a-zA-Z0-9_-]+(?:\/(?:overview|metrics|models|traces(?:\/[a-zA-Z0-9_-]+)?|api-keys(?:\/[a-zA-Z0-9_-]+(?:\/rotate)?)?))?)?|demo(?:\/(?:overview|metrics|models|traces(?:\/[a-zA-Z0-9_-]+)?))?)$/;
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  if (!allowedPath.test(endpoint))
    return Response.json({ error: { message: 'Endpoint not found.' } }, { status: 404 });
  if (endpoint.startsWith('demo') && request.method !== 'GET')
    return new Response(null, { status: 405 });
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'content-type', 'cf-connecting-ip']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: Uint8Array | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 16 * 1024) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(part.value);
      }
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  const target = new URL(`/v1/${endpoint}`, 'https://traceai-api.internal');
  target.search = new URL(request.url).search;
  const init: RequestInit = {
    method: request.method,
    headers,
    ...(body ? { body: body as BodyInit } : {}),
    redirect: 'manual',
    cache: 'no-store',
  };
  try {
    let response: Response;
    if (process.env.NODE_ENV === 'development') {
      const local = new URL(
        target.pathname + target.search,
        process.env.TRACEAI_API_URL ?? 'http://127.0.0.1:8787',
      );
      response = await fetch(local, init);
    } else {
      const { env } = getCloudflareContext();
      const binding = (env as typeof env & { TRACEAI_API?: { fetch: typeof fetch } }).TRACEAI_API;
      if (!binding) throw new Error('Missing API binding');
      response = await binding.fetch(new Request(target, init));
    }
    const outgoing = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['content-type', 'set-cookie', 'retry-after', 'x-request-id']) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json(
      { error: { message: 'TraceAI API is temporarily unavailable. Please try again.' } },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
