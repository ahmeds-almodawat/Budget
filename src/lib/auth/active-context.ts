import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

export const ACTIVE_LEGAL_ENTITY_COOKIE = "ecp_active_legal_entity_id";

export function getMembershipLegalEntityIds(ctx: AuthenticatedUserContext): string[] {
  const fromMembership = ctx.memberships
    .map((membership) => membership.legal_entity_id)
    .filter((id): id is string => id != null && id.length > 0);
  return [...new Set([...fromMembership, ...ctx.legalEntityIds])];
}

export function resolveActiveLegalEntityId(
  ctx: AuthenticatedUserContext,
  cookieValue: string | null | undefined,
): string | null {
  const allowed = getMembershipLegalEntityIds(ctx);
  if (allowed.length === 0) {
    return null;
  }

  const trimmed = cookieValue?.trim();
  if (trimmed && allowed.includes(trimmed)) {
    return trimmed;
  }

  if (!trimmed) {
    return ctx.primaryLegalEntityId && allowed.includes(ctx.primaryLegalEntityId)
      ? ctx.primaryLegalEntityId
      : allowed[0];
  }

  return null;
}

export function requireActiveLegalEntity(
  ctx: AuthenticatedUserContext,
  cookieValue: string | null | undefined,
): string {
  const resolved = resolveActiveLegalEntityId(ctx, cookieValue);
  if (resolved) {
    return resolved;
  }

  const allowed = getMembershipLegalEntityIds(ctx);
  if (allowed.length === 0) {
    throw new AuthError("No active organization membership.", "NO_MEMBERSHIP");
  }

  const trimmed = cookieValue?.trim();
  if (trimmed && !allowed.includes(trimmed)) {
    throw new AuthError("Access denied for this legal entity.", "FORBIDDEN");
  }

  throw new AuthError("Active legal entity must be selected.", "FORBIDDEN");
}
