export type DomainErrorCode =
  | "MISSING_TABLE"
  | "UNSUPPORTED_FILING_STATUS"
  | "INVALID_INPUT_RANGE"
  | "INCOMPLETE_STATE_RULE";

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  field?: string;
}

export interface Success<T> {
  ok: true;
  value: T;
}

export interface Failure {
  ok: false;
  errors: DomainError[];
}

export type DomainResult<T> = Success<T> | Failure;
