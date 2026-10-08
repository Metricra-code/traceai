import { describe, expect, it } from 'vitest';
import { MAX_PAYLOAD_BYTES } from '@traceai/shared';
import { readBoundedJson } from './bounded-json';

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}): Request {
  const init = {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
    duplex: 'half',
  };
  return new Request('https://traceai.test/ingestion', init);
}

describe('bounded streaming JSON boundary', () => {
  it('parses a JSON body without trusting content-length', async () => {
    expect(await readBoundedJson(jsonRequest('{"events":[]}'))).toEqual({ events: [] });
  });
  it('rejects streamed bytes exceeding the ceiling and cancels its reader', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PAYLOAD_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readBoundedJson(jsonRequest(body))).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });
  it('rejects invalid JSON, invalid UTF-8 and unsupported encodings', async () => {
    await expect(readBoundedJson(jsonRequest('{invalid'))).rejects.toMatchObject({ status: 400 });
    await expect(readBoundedJson(jsonRequest(new Uint8Array([0xc3, 0x28])))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readBoundedJson(jsonRequest('{}', { 'content-encoding': 'gzip' })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readBoundedJson(jsonRequest('{}', { 'content-length': String(MAX_PAYLOAD_BYTES + 1) })),
    ).rejects.toMatchObject({ status: 413 });
  });
});
