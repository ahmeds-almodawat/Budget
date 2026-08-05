"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  getApprovalInbox,
  getApprovalRequestCounts,
  type ApprovalTab,
} from "@/data/repositories/approval-repository";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

export async function fetchApprovalInboxAction(tab: ApprovalTab = "awaiting") {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "approval", "read", LEGAL_ENTITY_MODAWAT);
    return getApprovalInbox(db, LEGAL_ENTITY_MODAWAT, tab, ctx.userId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchApprovalCountsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "approval", "read", LEGAL_ENTITY_MODAWAT);
    return getApprovalRequestCounts(db, LEGAL_ENTITY_MODAWAT, ctx.userId);
  } catch (error) {
    mapActionError(error);
  }
}
