export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RETRIES = 4;
export const INITIAL_BACKOFF_MS = 2_000;
export const MAX_BACKOFF_MS = 30_000;

// PDGA asks API consumers to identify themselves
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "pdga-whats-my-rating (github.com/cclark20/pdga-whats-my-rating)",
};

/**
 * A non-2xx response from PDGA. Carries a label instead of the URL: some
 * endpoint URLs are private and must not end up in logs or API responses.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly label: string;

  constructor(status: number, label: string) {
    super(`PDGA ${label} returned HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.label = label;
  }
}

export type FetchJson = (url: string, label: string) => Promise<unknown>;

interface FetcherOptions {
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Max PDGA requests in flight across all users. */
  maxConcurrent?: number;
  onRetry?: (attempt: number, waitMs: number, label: string) => void;
  log?: (message: string) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Small semaphore so concurrent lookups queue instead of bursting PDGA. */
function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/** GET JSON with retry on 429 (exponential backoff), raising HttpError otherwise. */
export function createFetcher(opts: FetcherOptions = {}): FetchJson {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const limit = limiter(opts.maxConcurrent ?? 2);
  const log = opts.log ?? (() => {});

  return (url, label) =>
    limit(async () => {
      for (let attempt = 0; ; attempt++) {
        log(`pdga GET ${label}`);
        const response = await doFetch(url, {
          headers: HEADERS,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return response.json();
        if (response.status !== 429 || attempt >= MAX_RETRIES) {
          throw new HttpError(response.status, label);
        }
        // the slot is held while backing off, which slows every caller down
        // when PDGA is rate limiting — that's intended
        const wait = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
        opts.onRetry?.(attempt, wait, label);
        await sleep(wait);
      }
    });
}
