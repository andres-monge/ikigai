export const OPENAI_TRANSCRIPTION_MODEL = 'gpt-transcribe';
export const MAX_TRANSCRIPTION_RESPONSE_BYTES = 65_536;
export const MAX_TRANSCRIPT_CODE_UNITS = 32_000;

export type TranscriptionMediaType = 'audio/webm' | 'audio/mp4';

export type OpenAITranscriptionErrorKind =
  | 'unavailable'
  | 'provider-failure'
  | 'response-too-large'
  | 'invalid-response'
  | 'empty-transcript'
  | 'transcript-too-large';

export class OpenAITranscriptionError extends Error {
  constructor(readonly kind: OpenAITranscriptionErrorKind) {
    super('Transcription is temporarily unavailable.');
    this.name = 'OpenAITranscriptionError';
  }
}

const TRANSCRIPTION_PROMPT = [
  'Transcribe verbatim, preserving the English, Spanish, or code-switched languages actually spoken.',
  'Do not translate or force one output language.',
  'Vocabulary hints: Revelio, Ikigai, Career Map, Why, Purpose Paths, First Project.',
].join(' ');

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Transcription request aborted.', 'AbortError');
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  if (signal.aborted) throw abortReason(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener('abort', abort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  await body.cancel().catch(() => undefined);
}

async function readBoundedResponse(response: Response, signal?: AbortSignal): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/u.test(declaredLength)
    && Number(declaredLength) > MAX_TRANSCRIPTION_RESPONSE_BYTES) {
    await cancelBody(response.body);
    throw new OpenAITranscriptionError('response-too-large');
  }
  if (!response.body) throw new OpenAITranscriptionError('invalid-response');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await readWithAbort(reader, signal);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_TRANSCRIPTION_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new OpenAITranscriptionError('response-too-large');
      }
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (signal?.aborted) throw abortReason(signal);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function transcribeOpenAIAudio(input: {
  apiKey: string;
  audio: Buffer;
  mediaType: TranscriptionMediaType;
  abortSignal?: AbortSignal;
  fetchImplementation?: typeof fetch;
}): Promise<string> {
  if (!input.apiKey) throw new OpenAITranscriptionError('unavailable');
  const form = new FormData();
  const extension = input.mediaType === 'audio/mp4' ? 'mp4' : 'webm';
  form.append('file', new Blob([new Uint8Array(input.audio)], { type: input.mediaType }), `recording.${extension}`);
  form.append('model', OPENAI_TRANSCRIPTION_MODEL);
  form.append('response_format', 'json');
  form.append('prompt', TRANSCRIPTION_PROMPT);

  const fetchImplementation = input.fetchImplementation ?? fetch;
  let response: Response;
  try {
    response = await fetchImplementation('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      signal: input.abortSignal,
    });
  } catch (error) {
    if (input.abortSignal?.aborted) throw abortReason(input.abortSignal);
    throw new OpenAITranscriptionError('provider-failure');
  }

  if (!response.ok) {
    await cancelBody(response.body);
    throw new OpenAITranscriptionError(
      response.status === 401 || response.status === 403 ? 'unavailable' : 'provider-failure',
    );
  }

  const bytes = await readBoundedResponse(response, input.abortSignal);
  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new OpenAITranscriptionError('invalid-response');
  }
  if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).text !== 'string') {
    throw new OpenAITranscriptionError('invalid-response');
  }
  const text = (body as { text: string }).text;
  if (text.trim().length === 0) throw new OpenAITranscriptionError('empty-transcript');
  if (text.length > MAX_TRANSCRIPT_CODE_UNITS) {
    throw new OpenAITranscriptionError('transcript-too-large');
  }
  return text;
}
