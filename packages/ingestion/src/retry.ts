export type Sleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

const BASE_BACKOFF_MS = 250;

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function cappedRetryAfterMilliseconds(
  retryAfter: string | null,
  maximumMilliseconds: number,
): number | null {
  if (retryAfter === null || !/^\d+$/.test(retryAfter.trim())) return null;

  const seconds = Number(retryAfter.trim());
  if (!Number.isFinite(seconds)) return maximumMilliseconds;

  return Math.min(seconds, maximumMilliseconds / 1_000) * 1_000;
}

export function retryDelayMilliseconds(options: {
  retryNumber: number;
  retryAfter: string | null;
  maximumRetryAfterMilliseconds: number;
  random: () => number;
}): number {
  const maximum = Math.max(0, options.maximumRetryAfterMilliseconds);
  const retryAfter = cappedRetryAfterMilliseconds(options.retryAfter, maximum);
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
