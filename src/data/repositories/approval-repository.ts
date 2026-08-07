import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";

export type ApprovalTab = "awaiting" | "submitted" | "approved" | "rejected" | "delegated" | "overdue";

export interface ApprovalInboxItem {
  entity_id: string;
  legal_entity_id: string;
  item_type: string;
  title_en: string;
  title_ar: string;
  requester_id: string | null;
  original_assignee_id: string | null;
  effective_assignee_id: string | null;
  delegation_id: string | null;
  approval_status: string;
  submitted_at: string;
  due_date: string | null;
}

export interface ApprovalInboxOptions {
  /** When true, awaiting includes all submitted/under_review items (approver role). */
  canApprove?: boolean;
}

function isOpenStatus(status: string) {
  return status === "submitted" || status === "under_review";
}

export async function getApprovalInbox(
  db: SupabaseClient,
  legalEntityId: string,
  tab: ApprovalTab,
  userId: string,
  options: ApprovalInboxOptions = {},
) {
  if (tab === "delegated") {
    const { data, error } = await db
      .from("v_delegated_approval_inbox")
      .select("*")
      .eq("legal_entity_id", legalEntityId);
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return ((data ?? []) as ApprovalInboxItem[]).filter(
      (i) => i.delegation_id != null && i.effective_assignee_id === userId,
    );
  }

  const { data, error } = await db
    .from("v_approval_inbox")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const items = (data ?? []) as ApprovalInboxItem[];
  const now = new Date();
  const canApprove = options.canApprove === true;

  switch (tab) {
    case "awaiting":
      return items.filter((i) => {
        if (!isOpenStatus(i.approval_status)) return false;
        if (i.effective_assignee_id === userId) return true;
        return canApprove;
      });
    case "submitted":
      return items.filter((i) => i.requester_id === userId);
    case "approved":
      return items.filter((i) => i.approval_status === "approved");
    case "rejected":
      return items.filter((i) => i.approval_status === "rejected");
    case "overdue":
      return items.filter(
        (i) =>
          i.due_date &&
          new Date(i.due_date) < now &&
          !["approved", "rejected", "cancelled"].includes(i.approval_status) &&
          (i.effective_assignee_id === userId || canApprove),
      );
    default:
      return items;
  }
}

export async function getApprovalRequestCounts(
  db: SupabaseClient,
  legalEntityId: string,
  userId: string,
  options: ApprovalInboxOptions = {},
) {
  const tabs: ApprovalTab[] = ["awaiting", "submitted", "approved", "rejected", "delegated", "overdue"];
  const counts: Record<ApprovalTab, number> = {
    awaiting: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    delegated: 0,
    overdue: 0,
  };
  for (const tab of tabs) {
    const items = await getApprovalInbox(db, legalEntityId, tab, userId, options);
    counts[tab] = items.length;
  }
  return counts;
}

export async function createApprovalRequest(
  db: SupabaseClient,
  input: {
    legalEntityId: string;
    itemType: string;
    entityId: string;
    titleEn: string;
    titleAr: string;
    requesterId: string;
    dueDate?: string;
  },
) {
  const { data, error } = await db
    .from("approval_requests")
    .insert({
      legal_entity_id: input.legalEntityId,
      item_type: input.itemType,
      entity_id: input.entityId,
      title_en: input.titleEn,
      title_ar: input.titleAr,
      requester_id: input.requesterId,
      due_date: input.dueDate,
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data;
}
