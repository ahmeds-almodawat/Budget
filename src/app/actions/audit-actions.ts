"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  getOpenExceptions,
  searchAuditEvents,
  type AuditSearchFilters,
} from "@/data/repositories/audit-repository";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

export async function fetchAuditEventsAction(filters: AuditSearchFilters = {}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "audit", "read", LEGAL_ENTITY_MODAWAT);
    return searchAuditEvents(db, filters);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchExceptionsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "audit", "read", LEGAL_ENTITY_MODAWAT);
    return getOpenExceptions(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}
