"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { hasPermission } from "@/domain/auth/permissions";
import { approvalActAsDelegate } from "@/lib/commands";
import {
  getApprovalInbox,
  getApprovalRequestCounts,
  type ApprovalTab,
} from "@/data/repositories/approval-repository";

function inboxOptions(ctx: { roleAssignments: Parameters<typeof hasPermission>[0] }, legalEntityId: string) {
  return {
    canApprove: hasPermission(ctx.roleAssignments, "approval", "approve", legalEntityId),
  };
}

export async function fetchApprovalInboxAction(tab: ApprovalTab = "awaiting") {
  return withActivePermission("approval", "read", async ({ ctx, legalEntityId, db }) =>
    getApprovalInbox(db, legalEntityId, tab, ctx.userId, inboxOptions(ctx, legalEntityId)),
  );
}

export async function fetchApprovalCountsAction() {
  return withActivePermission("approval", "read", async ({ ctx, legalEntityId, db }) =>
    getApprovalRequestCounts(db, legalEntityId, ctx.userId, inboxOptions(ctx, legalEntityId)),
  );
}

export async function actAsDelegateAction(params: {
  itemType: string;
  entityId: string;
  decision: string;
  originalAssigneeId: string;
  delegationId: string;
  comments?: string;
}) {
  return withActivePermission("approval", "approve", async ({ db }) => {
    await approvalActAsDelegate(db, params);
    return { ok: true as const };
  });
}
