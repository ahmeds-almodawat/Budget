import "server-only";

import { redirect, unstable_rethrow } from "next/navigation";
import { getLocale } from "next-intl/server";
import type {
  AuthorizationScope,
  PermissionAction,
  PermissionResource,
} from "@/domain/auth/permissions";
import {
  assertLegalEntityAccess,
  requirePermission,
} from "@/lib/auth/context";
import { isAuthError } from "@/lib/auth/errors";
import {
  getActiveSession,
  type ActiveSessionContext,
} from "@/lib/auth/session-context";
import {
  PublicError,
  toPublicDataAccessError,
} from "@/lib/errors/safe-error";

const CONTROLLED_DENIAL_CODES = new Set([
  "UNAUTHENTICATED",
  "NO_MEMBERSHIP",
  "FORBIDDEN",
]);

async function renderControlledDenial(error: unknown): Promise<never> {
  if (
    (isAuthError(error) && CONTROLLED_DENIAL_CODES.has(error.code)) ||
    (error instanceof PublicError && CONTROLLED_DENIAL_CODES.has(error.code))
  ) {
    const locale = await getLocale();
    redirect(`/${locale}/auth/access-denied`);
  }
  throw toPublicDataAccessError(error);
}

export async function requireRoutePermission(
  resource: PermissionResource,
  action: PermissionAction = "read",
  scope?: string | AuthorizationScope,
): Promise<ActiveSessionContext> {
  try {
    const session = await getActiveSession();
    assertLegalEntityAccess(session.ctx, session.legalEntityId);
    requirePermission(
      session.ctx,
      resource,
      action,
      scope ?? session.legalEntityId,
    );
    return session;
  } catch (error) {
    unstable_rethrow(error);
    return renderControlledDenial(error);
  }
}

export async function loadRouteData<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    unstable_rethrow(error);
    return renderControlledDenial(error);
  }
}
