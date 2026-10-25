import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

// Public services such as Wikimedia ask for a descriptive User-Agent on automated requests.
export const USER_AGENT =
  'verdronkendorpen-exploration/0.0 (HackaLOD 2026; https://github.com/daanjo3/verdronkendorpen)';

/** fetch() with our User-Agent. Also usable as Comunica's `fetch` context option. */
export function fetchWithUserAgent(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('user-agent', USER_AGENT);
  return fetch(input, { ...init, headers });
}

export interface FetchTextOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  /** May throw to reject a 200 response that is really an error. */
  validate?: (body: string) => void;
}

/** Fetch with a timeout and retries on network errors, error responses and failed validation. */
export async function fetchText(
  url: string,
  { timeoutMs = 180_000, retries = 3, retryDelayMs = 10_000, validate }: FetchTextOptions = {},
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithUserAgent(url, { signal: AbortSignal.timeout(timeoutMs) });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}\n${body.slice(0, 1000)}`);
      }
      validate?.(body);
      return body;
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${retries} failed: ${String(error).split('\n')[0]}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  throw lastError;
}

/**
 * Streams a (large) download to a file. Writes to `<path>.part` first and renames it when complete,
 * so an interrupted download never looks like a finished one. Fails on HTTP errors and when the size
 * differs from Content-Length.
 */
export async function downloadFile(url: string, path: string): Promise<void> {
  const response = await fetchWithUserAgent(url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}\n${(await response.text()).slice(0, 1000)}`);
  }
  const expected = Number(response.headers.get('content-length') ?? Number.NaN);
  const part = `${path}.part`;
  await mkdir(dirname(path), { recursive: true });
  let received = 0;
  let lastLog = Date.now();
  const body = Readable.fromWeb(response.body as ReadableStream);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      const total = Number.isNaN(expected) ? '' : ` of ${Math.round(expected / 1e6)} MB`;
      console.log(`  ${Math.round(received / 1e6)} MB${total}`);
    }
  });
  await pipeline(body, createWriteStream(part));
  const { size } = await stat(part);
  if (!Number.isNaN(expected) && size !== expected) {
    throw new Error(`Incomplete download of ${url}: ${size} of ${expected} bytes (kept as ${part})`);
  }
  await rename(part, path);
  console.log(`Wrote ${path} (${Math.round(size / 1e6)} MB)`);
}
