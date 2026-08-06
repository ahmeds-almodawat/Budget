import {
  assertLegalEntityAccess,
  requirePermission,
} from "@/lib/auth/context";
import { getActiveSession } from "@/lib/auth/session-context";
import type { PermissionAction, PermissionResource } from "@/domain/auth/permissions";
import type { ActiveSessionContext } from "@/lib/auth/session-context";
import { toPublicDataAccessError } from "@/lib/errors/safe-error";

export async function withActivePermission<T>(
  resource: PermissionResource,
  action: PermissionAction,
  handler: (session: ActiveSessionContext) => Promise<T>,
): Promise<T> {
  try {
    const session = await getActiveSession();
    assertLegalEntityAccess(session.ctx, session.legalEntityId);
    requirePermission(session.ctx, resource, action, session.legalEntityId);
    return await handler(session);
  } catch (error) {
    throw toPublicDataAccessError(error);
  }
}
