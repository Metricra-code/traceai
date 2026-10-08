import { MAX_PAYLOAD_BYTES } from '@traceai/shared';
import { RequestError } from './http-errors';

export async function readBoundedJson(request: Request): Promise<unknown> {
  assertBodyHeaders(request);
  if (!request.body)
    throw new RequestError(400, 'invalid_json', 'A JSON request body is required.');
  const bytes = await readBodyBytes(request.body);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RequestError(400, 'invalid_json', 'The request body must contain valid JSON.');
  }
}

function assertBodyHeaders(request: Request): void {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw new RequestError(415, 'unsupported_media_type', 'Use Content-Type: application/json.');
  }
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PAYLOAD_BYTES)
  ) {
    throw new RequestError(413, 'payload_too_large', 'The request body exceeds 256 KiB.');
  }
  if (request.headers.has('content-encoding'))
    throw new RequestError(
      415,
      'unsupported_encoding',
      'Compressed request bodies are not supported.',
    );
}

async function readBodyBytes(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const bytes = new Uint8Array(MAX_PAYLOAD_BYTES);
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return bytes.slice(0, byteLength);
      byteLength += value.byteLength;
      if (byteLength > MAX_PAYLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestError(413, 'payload_too_large', 'The request body exceeds 256 KiB.');
      }
      bytes.set(value, byteLength - value.byteLength);
    }
  } finally {
    reader.releaseLock();
  }
}
