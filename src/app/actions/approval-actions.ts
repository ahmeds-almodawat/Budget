"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  getApprovalInbox,
  getApprovalRequestCounts,
  type ApprovalTab,
} from "@/data/repositories/approval-repository";

export async function fetchApprovalInboxAction(tab: ApprovalTab = "awaiting") {
  return withActivePermission("approval", "read", async ({ ctx, legalEntityId, db }) =>
    getApprovalInbox(db, legalEntityId, tab, ctx.userId),
  );
}

export async function fetchApprovalCountsAction() {
  return withActivePermission("approval", "read", async ({ ctx, legalEntityId, db }) =>
    getApprovalRequestCounts(db, legalEntityId, ctx.userId),
  );
}
