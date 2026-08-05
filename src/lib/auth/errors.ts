export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NO_MEMBERSHIP";

export class AuthError extends Error {
  constructor(
    message: string,
    public code: AuthErrorCode,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
