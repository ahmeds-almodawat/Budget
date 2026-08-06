import { randomUUID } from "crypto";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { isAuthError, type AuthErrorCode } from "@/lib/auth/errors";

export class PublicError extends Error {
  constructor(
    public correlationId: string,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  UNAUTHENTICATED: "Authentication required.",
  NO_MEMBERSHIP: "No active organization membership.",
  FORBIDDEN: "Access denied.",
};

const DATA_ACCESS_MESSAGES: Record<DataAccessError["code"], string> = {
  NOT_FOUND: "The requested resource was not found.",
  VALIDATION: "The request could not be validated.",
  FORBIDDEN: "Access denied.",
  CONFLICT: "The operation could not be completed due to a conflict.",
  DATABASE: "A database error occurred. Please try again later.",
};

export function generateCorrelationId(): string {
  return randomUUID();
}

export function sanitizeDatabaseMessage(message: string): string {
  return message
    .replace(/relation\s+"[^"]+"/gi, "resource")
    .replace(/table\s+"[^"]+"/gi, "resource")
    .replace(/column\s+"[^"]+"/gi, "field")
    .replace(/constraint\s+"[^"]+"/gi, "constraint")
    .replace(/policy\s+"[^"]+"/gi, "policy")
    .replace(/permission denied for (table|relation|schema|function)\s+[^\s.]+/gi, "permission denied")
  .replace(/\bSQLSTATE\s+[A-Z0-9]{5}\b/gi, "")
    .replace(/\bDETAIL:\s*.+$/gim, "")
    .replace(/\bHINT:\s*.+$/gim, "")
    .replace(/\bLINE\s+\d+:\s*.+$/gim, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function toPublicDataAccessError(
  error: unknown,
  correlationId: string = generateCorrelationId(),
): PublicError {
  if (error instanceof PublicError) {
    return error;
  }

  if (isAuthError(error)) {
    console.error(`[${correlationId}] AuthError`, { code: error.code, message: error.message });
    return new PublicError(correlationId, error.code, AUTH_MESSAGES[error.code]);
  }

  if (error instanceof DataAccessError) {
    console.error(`[${correlationId}] DataAccessError`, { code: error.code, message: error.message });
    if (error.code === "VALIDATION") {
      return new PublicError(correlationId, error.code, error.message);
    }
    if (error.code === "DATABASE") {
      return new PublicError(correlationId, error.code, DATA_ACCESS_MESSAGES.DATABASE);
    }
    return new PublicError(correlationId, error.code, DATA_ACCESS_MESSAGES[error.code]);
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const sanitized = sanitizeDatabaseMessage(rawMessage);
  const looksLikeDatabaseLeak =
    /relation|table|column|constraint|policy|permission denied|SQLSTATE/i.test(rawMessage);

  console.error(`[${correlationId}] Unhandled error`, {
    message: rawMessage,
    sanitized,
  });

  if (looksLikeDatabaseLeak) {
    return new PublicError(correlationId, "DATABASE", DATA_ACCESS_MESSAGES.DATABASE);
  }

  return new PublicError(correlationId, "INTERNAL", "An unexpected error occurred.");
}
