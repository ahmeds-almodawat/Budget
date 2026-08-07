"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  createReversal,
  getActualTransactions,
  getCommitments,
  getDuplicateQueue,
  getImportBatches,
  getUnmappedQueue,
  getVendors,
} from "@/data/repositories/financial-repository";

export async function fetchActualTransactionsAction() {
  return withActivePermission("actual", "read", async ({ legalEntityId, db }) =>
    getActualTransactions(db, legalEntityId),
  );
}

export async function fetchUnmappedQueueAction() {
  return withActivePermission("actual", "read", async ({ legalEntityId, db }) =>
    getUnmappedQueue(db, legalEntityId),
  );
}

export async function fetchImportBatchesAction() {
  return withActivePermission("actual", "read", async ({ legalEntityId, db }) =>
    getImportBatches(db, legalEntityId),
  );
}

export async function fetchDuplicateQueueAction() {
  return withActivePermission("actual", "read", async ({ legalEntityId, db }) =>
    getDuplicateQueue(db, legalEntityId),
  );
}

export async function fetchVendorsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    getVendors(db, legalEntityId),
  );
}

export async function fetchCommitmentsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    getCommitments(db, legalEntityId),
  );
}

export async function createReversalAction(transactionId: string, reason: string) {
  return withActivePermission("actual", "approve", async ({ ctx, legalEntityId, db }) =>
    createReversal(db, {
      legalEntityId,
      originalTransactionId: transactionId,
      actorId: ctx.userId,
      reason,
    }),
  );
}
