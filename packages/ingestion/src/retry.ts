export type Sleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

const BASE_BACKOFF_MS = 250;

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

const httpDatePattern =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function cappedRetryAfterMilliseconds(
  retryAfter: string | null,
  maximumMilliseconds: number,
  now: () => number,
): number | null {
  if (retryAfter === null) return null;

  const trimmed = retryAfter.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return maximumMilliseconds;

    return Math.min(seconds, maximumMilliseconds / 1_000) * 1_000;
  }

  if (!httpDatePattern.test(trimmed)) return null;

  const timestamp = Date.parse(trimmed);
  const currentTimestamp = now();
  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(currentTimestamp) ||
    new Date(timestamp).toUTCString() !== trimmed
  ) {
    return null;
  }

  return Math.min(
    maximumMilliseconds,
    Math.max(0, timestamp - currentTimestamp),
  );
}

export function retryDelayMilliseconds(options: {
  retryNumber: number;
  retryAfter: string | null;
  maximumRetryAfterMilliseconds: number;
  random: () => number;
  now: () => number;
}): number {
  const maximum = Math.max(0, options.maximumRetryAfterMilliseconds);
  const retryAfter = cappedRetryAfterMilliseconds(
    options.retryAfter,
    maximum,
    options.now,
  );
  if (retryAfter !== null) return retryAfter;

  const randomValue = Math.min(1, Math.max(0, options.random()));
  const exponential = BASE_BACKOFF_MS * 2 ** (options.retryNumber - 1);
  const withJitter = exponential * (0.5 + randomValue * 0.5);
  return Math.min(maximum, Math.round(withJitter));
}

export const sleep: Sleep = async (milliseconds, signal) => {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
};
