import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";

export interface PeriodCloseChecklistItemRow {
  id: string;
  template_id: string;
  sequence_no: number;
  name_en: string;
  name_ar: string;
  description: string | null;
  item_type: string;
  is_required: boolean;
  is_blocking: boolean;
  control_code: string | null;
}

export interface PeriodCloseTemplateRow {
  id: string;
  legal_entity_id: string;
  module: string;
  code: string;
  name_en: string;
  name_ar: string;
  is_active: boolean;
  version_number: number;
  governance_status: string;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  period_close_checklist_items?: PeriodCloseChecklistItemRow[];
}

export interface PeriodCloseInstanceRow {
  id: string;
  legal_entity_id: string;
  fiscal_period_id: string;
  module: string;
  template_id: string | null;
  readiness_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PeriodCloseItemResultRow {
  id: string;
  instance_id: string;
  checklist_item_id: string;
  item_status: string;
  completed_by: string | null;
  completed_at: string | null;
  evidence_reference: string | null;
  comments: string | null;
  waiver_reason: string | null;
  automatic_result: Record<string, unknown> | null;
}

export interface PeriodReopenRequestRow {
  id: string;
  legal_entity_id: string;
  fiscal_period_id: string;
  module: string;
  requested_by: string;
  approved_by: string | null;
  status: string;
  reason: string;
  decision_reason: string | null;
  evidence_reference: string | null;
  requested_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ChecklistWorkspaceData {
  instance: PeriodCloseInstanceRow | null;
  items: Array<PeriodCloseChecklistItemRow & { result_status: string | null; result_id: string | null }>;
  reopenRequests: PeriodReopenRequestRow[];
}

export async function listPeriodCloseTemplates(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("period_close_checklist_templates")
    .select("*, period_close_checklist_items(*)")
    .eq("legal_entity_id", legalEntityId)
    .order("module")
    .order("code")
    .order("version_number", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as PeriodCloseTemplateRow[];
}

export async function getPeriodChecklistWorkspace(
  db: SupabaseClient,
  legalEntityId: string,
  fiscalPeriodId: string,
  module: string,
): Promise<ChecklistWorkspaceData> {
  const { data: instance, error: instErr } = await db
    .from("period_close_instances")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .eq("fiscal_period_id", fiscalPeriodId)
    .eq("module", module)
    .maybeSingle();
  if (instErr) throw new DataAccessError(instErr.message, "DATABASE");

  const { data: reopenRequests, error: reopenErr } = await db
    .from("period_reopen_requests")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .eq("fiscal_period_id", fiscalPeriodId)
    .eq("module", module)
    .order("created_at", { ascending: false });
  if (reopenErr) throw new DataAccessError(reopenErr.message, "DATABASE");

  if (!instance) {
    return {
      instance: null,
      items: [],
      reopenRequests: (reopenRequests ?? []) as PeriodReopenRequestRow[],
    };
  }

  let checklistItems: PeriodCloseChecklistItemRow[] = [];
  if (instance.template_id) {
    const { data: items, error: itemsErr } = await db
      .from("period_close_checklist_items")
      .select("*")
      .eq("template_id", instance.template_id)
      .order("sequence_no");
    if (itemsErr) throw new DataAccessError(itemsErr.message, "DATABASE");
    checklistItems = (items ?? []) as PeriodCloseChecklistItemRow[];
  }

  const { data: results, error: resErr } = await db
    .from("period_close_item_results")
    .select("*")
    .eq("instance_id", instance.id);
  if (resErr) throw new DataAccessError(resErr.message, "DATABASE");

  const byItem = new Map(
    ((results ?? []) as PeriodCloseItemResultRow[]).map((r) => [r.checklist_item_id, r]),
  );

  return {
    instance: instance as PeriodCloseInstanceRow,
    items: checklistItems.map((item) => {
      const result = byItem.get(item.id);
      return {
        ...item,
        result_status: result?.item_status ?? null,
        result_id: result?.id ?? null,
      };
    }),
    reopenRequests: (reopenRequests ?? []) as PeriodReopenRequestRow[],
  };
}
