import {
  CvFileValidationError,
  type CvFileErrorCode,
} from "@jobwarden/profile";

export type CareerExtractionErrorCode =
  | CvFileErrorCode
  | "bad_request"
  | "unauthorised"
  | "forbidden"
  | "not_found"
  | "already_running"
  | "runtime_unavailable"
  | "persistence_failed";

export class CareerExtractionError extends Error {
  override readonly name = "CareerExtractionError";

  constructor(readonly code: CareerExtractionErrorCode) {
    super("Request failed.");
  }
}

export function safeCareerErrorCode(error: unknown): CareerExtractionErrorCode {
  if (error instanceof CareerExtractionError) return error.code;
  if (error instanceof CvFileValidationError) return error.code;
  return "internal_error";
}

export function statusForCareerError(code: CareerExtractionErrorCode): number {
  if (code === "bad_request") return 400;
  if (code === "unauthorised") return 401;
  if (code === "forbidden") return 403;
  if (code === "not_found" || code === "storage_missing") return 404;
  if (code === "already_running") return 409;
  if (code === "runtime_unavailable" || code === "persistence_failed")
    return 503;
  if (code === "internal_error") return 500;
  return 422;
}
