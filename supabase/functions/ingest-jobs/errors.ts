import { AdapterError } from "@jobwarden/ingestion";

const safeErrorCodePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function sanitiseErrorCode(value: string): string {
  return value.length >= 3 &&
    value.length <= 100 &&
    safeErrorCodePattern.test(value)
    ? value
    : "runtime_unexpected";
}

export function runtimeErrorCode(error: unknown): string {
  if (error instanceof AdapterError) {
    return sanitiseErrorCode(`provider_${error.code}`);
  }

  return "runtime_unexpected";
}

export function retryCount(error: unknown): number {
  return error instanceof AdapterError ? Math.max(0, error.attempts - 1) : 0;
}
