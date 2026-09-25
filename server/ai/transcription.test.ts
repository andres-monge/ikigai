import { describe, expect, it, vi } from 'vitest';
import {
  MAX_TRANSCRIPTION_RESPONSE_BYTES,
  OpenAITranscriptionError,
  transcribeOpenAIAudio,
} from './transcription.js';

const API_KEY = 'private-openai-key';
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);

function jsonBodyOfSize(size: number): Uint8Array {
  const prefix = '{"text":"bounded","padding":"';
  const suffix = '"}';
  const padding = 'x'.repeat(size - Buffer.byteLength(prefix) - Buffer.byteLength(suffix));
  const body = Buffer.from(`${prefix}${padding}${suffix}`);
  expect(body).toHaveLength(size);
  return body;
}

function trackedStream(chunks: Uint8Array[]) {
  let pulls = 0;
  let cancels = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulls];
      pulls += 1;
      if (chunk) controller.enqueue(chunk);
    },
    cancel() {
      cancels += 1;
    },
  });
  return { stream, pulls: () => pulls, cancels: () => cancels };
}

describe('OpenAI transcription adapter', () => {
  it.each([
    ['audio/webm', 'recording.webm'],
    ['audio/mp4', 'recording.mp4'],
  ] as const)('sends one bounded multipart %s request', async (mediaType, filename) => {
    let capturedInit: RequestInit | undefined;
    const fetchImplementation = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ text: 'hello', ignored: 'provider-private' }), {
        status: 200,
      });
    });

    await expect(transcribeOpenAIAudio({
      apiKey: API_KEY,
      audio: WEBM,
      mediaType,
      fetchImplementation: fetchImplementation as typeof fetch,
    })).resolves.toBe('hello');
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.headers).toEqual({ Authorization: `Bearer ${API_KEY}` });
    const form = capturedInit?.body as FormData;
    expect(form.get('model')).toBe('gpt-transcribe');
    expect(form.get('response_format')).toBe('json');
    expect(String(form.get('prompt'))).toMatch(/English.*Spanish.*code-switch/i);
    expect(String(form.get('prompt'))).toMatch(/do not translate/i);
    const file = form.get('file') as Blob & { name: string };
    expect(file.name).toBe(filename);
    expect(file.type).toBe(mediaType);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(WEBM);
  });

  it('accepts a provider body exactly at the response-byte cap', async () => {
    const body = jsonBodyOfSize(MAX_TRANSCRIPTION_RESPONSE_BYTES);
    const fetchImplementation = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'content-length': String(body.length) },
    }));

    await expect(transcribeOpenAIAudio({
      apiKey: API_KEY, audio: WEBM, mediaType: 'audio/webm', fetchImplementation,
    })).resolves.toBe('bounded');
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('rejects an oversized declared response before reading and cancels it', async () => {
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(MAX_TRANSCRIPTION_RESPONSE_BYTES + 1) }),
      body: { cancel, getReader },
    } as unknown as Response;
    const fetchImplementation = vi.fn(async () => response);

    const result = transcribeOpenAIAudio({
      apiKey: API_KEY, audio: WEBM, mediaType: 'audio/webm', fetchImplementation,
    });
    await expect(result).rejects.toMatchObject({ kind: 'response-too-large' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
    await expect(result).rejects.not.toThrow(/PRIVATE_PROVIDER_BODY_SENTINEL/);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it.each([
    ['absent', undefined],
    ['falsely small', '8'],
  ] as const)('cancels a chunk-split overflow with %s Content-Length', async (_label, length) => {
    const tracked = trackedStream([
      Buffer.alloc(MAX_TRANSCRIPTION_RESPONSE_BYTES - 2, 0x20),
      Buffer.from('PRIVATE_PROVIDER_BODY_SENTINEL'),
    ]);
    const headers = length === undefined ? undefined : { 'content-length': length };
    const fetchImplementation = vi.fn(async () => new Response(tracked.stream, { status: 200, headers }));

    await expect(transcribeOpenAIAudio({
      apiKey: API_KEY, audio: WEBM, mediaType: 'audio/webm', fetchImplementation,
    })).rejects.toMatchObject({ kind: 'response-too-large' });
    await vi.waitFor(() => expect(tracked.cancels()).toBe(1));
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('cancels a provider body when the request aborts during streaming', async () => {
    let cancelled = false;
    let firstChunk!: () => void;
    const firstChunkGate = new Promise<void>((resolve) => { firstChunk = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('{"text":"'));
        firstChunk();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImplementation = vi.fn(async () => new Response(stream, { status: 200 }));
    const controller = new AbortController();
    const result = transcribeOpenAIAudio({
      apiKey: API_KEY,
      audio: WEBM,
      mediaType: 'audio/webm',
      abortSignal: controller.signal,
      fetchImplementation,
    });
    await firstChunkGate;
    controller.abort(new DOMException('Client disconnected.', 'AbortError'));

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(cancelled).toBe(true));
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it.each([
    ['malformed JSON', '{PRIVATE_PROVIDER_BODY_SENTINEL', 'invalid-response'],
    ['missing text', '{"ignored":"PRIVATE_PROVIDER_BODY_SENTINEL"}', 'invalid-response'],
    ['wrong text type', '{"text":42,"ignored":"PRIVATE_PROVIDER_BODY_SENTINEL"}', 'invalid-response'],
    ['empty text', '{"text":""}', 'empty-transcript'],
    ['oversized text', JSON.stringify({ text: 'x'.repeat(32_001) }), 'transcript-too-large'],
  ] as const)('maps %s to a payload-free typed failure', async (_label, body, kind) => {
    const fetchImplementation = vi.fn(async () => new Response(body, { status: 200 }));

    const result = transcribeOpenAIAudio({
      apiKey: API_KEY, audio: WEBM, mediaType: 'audio/webm', fetchImplementation,
    });
    await expect(result).rejects.toBeInstanceOf(OpenAITranscriptionError);
    await expect(result).rejects.toMatchObject({ kind });
    await expect(result).rejects.not.toThrow(/PRIVATE_PROVIDER_BODY_SENTINEL/);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it.each([
    [401, 'unavailable'],
    [403, 'unavailable'],
    [429, 'provider-failure'],
    [500, 'provider-failure'],
  ] as const)('maps upstream %i without exposing or retrying its body', async (status, kind) => {
    const fetchImplementation = vi.fn(async () => new Response('PRIVATE_PROVIDER_BODY_SENTINEL', { status }));

    const result = transcribeOpenAIAudio({
      apiKey: API_KEY, audio: WEBM, mediaType: 'audio/webm', fetchImplementation,
    });
    await expect(result).rejects.toMatchObject({ kind });
    await expect(result).rejects.not.toThrow(/PRIVATE_PROVIDER_BODY_SENTINEL/);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });
});
