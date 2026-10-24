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
