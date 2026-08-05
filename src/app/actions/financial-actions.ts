"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  createReversal,
  getActualTransactions,
  getCommitments,
  getDuplicateQueue,
  getImportBatches,
  getUnmappedQueue,
  getVendors,
} from "@/data/repositories/financial-repository";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

export async function fetchActualTransactionsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "actual", "read", LEGAL_ENTITY_MODAWAT);
    return getActualTransactions(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchUnmappedQueueAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "actual", "read", LEGAL_ENTITY_MODAWAT);
    return getUnmappedQueue(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchImportBatchesAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "actual", "read", LEGAL_ENTITY_MODAWAT);
    return getImportBatches(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchDuplicateQueueAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "actual", "read", LEGAL_ENTITY_MODAWAT);
    return getDuplicateQueue(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchVendorsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "commitment", "read", LEGAL_ENTITY_MODAWAT);
    return getVendors(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchCommitmentsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "commitment", "read", LEGAL_ENTITY_MODAWAT);
    return getCommitments(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function createReversalAction(transactionId: string, reason: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "actual", "approve", LEGAL_ENTITY_MODAWAT);
    return createReversal(db, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      originalTransactionId: transactionId,
      actorId: ctx.userId,
      reason,
    });
  } catch (error) {
    mapActionError(error);
  }
}
