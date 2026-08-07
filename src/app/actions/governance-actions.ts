"use server";

import { DataAccessError } from "@/data/repositories/budget-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDecisions,
  getIssues,
  getRegisterActions,
  getRisks,
} from "@/data/repositories/governance-repository";
import { loadBudgetVsActualWorkspaceData } from "@/data/repositories/revenue-repository";
import { FISCAL_YEAR_2027 } from "@/types/database";
import {
  delegationActivate,
  delegationApprove,
  delegationCancel,
  delegationCreateDraft,
  delegationRevoke,
  delegationSubmit,
  masterRecordCreateDraft,
  masterRecordCreateRevision,
  masterRecordDeactivate,
  masterRecordReject,
  periodChecklistSetResult,
  periodCloseEvaluateReadiness,
  periodHardCloseGated,
  periodReopenApprove,
  periodReopenRequest,
  periodSoftClose,
  periodTemplateAddItem,
  periodTemplateApprove,
  periodTemplateCreate,
  periodTemplateRetire,
  periodTemplateSubmit,
  requisitionCreateDraft,
  requisitionSubmit,
} from "@/lib/commands";
import {
  getPeriodChecklistWorkspace,
  listPeriodCloseTemplates,
} from "@/data/repositories/period-close-repository";
import { withActivePermission } from "@/lib/auth/action-guard";

export async function fetchRisksAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getRisks(db, legalEntityId),
  );
}

export async function fetchIssuesAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getIssues(db, legalEntityId),
  );
}

export async function fetchRegisterActionsAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getRegisterActions(db, legalEntityId),
  );
}

export async function fetchDecisionsAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getDecisions(db, legalEntityId),
  );
}

export async function fetchCostControlSummaryAction() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("v_budget_vs_actual")
      .select("control_scope_id, current_approved_amount, ytd_actual, commitment_open")
      .eq("legal_entity_id", legalEntityId);
    if (error) throw new DataAccessError(error.message, "DATABASE");

    const { data: scopes } = await db
      .from("control_scopes")
      .select("id, name_en")
      .eq("legal_entity_id", legalEntityId);

    const byScope = new Map<string, { approved: number; actual: number; commitment: number }>();
    for (const row of data ?? []) {
      const sid = row.control_scope_id as string;
      const cur = byScope.get(sid) ?? { approved: 0, actual: 0, commitment: 0 };
      cur.approved += Number(row.current_approved_amount ?? 0);
      cur.actual += Number(row.ytd_actual ?? 0);
      cur.commitment += Number(row.commitment_open ?? 0);
      byScope.set(sid, cur);
    }

    const scopeNames = new Map((scopes ?? []).map((s) => [s.id, s.name_en]));
    return [...byScope.entries()].map(([control_scope_id, agg]) => ({
      control_scope_id,
      scope_name: scopeNames.get(control_scope_id) ?? control_scope_id,
      approved_budget: agg.approved.toFixed(2),
      actual_cost: agg.actual.toFixed(2),
      committed_cost: agg.commitment.toFixed(2),
      open_commitment: agg.commitment.toFixed(2),
      variance: (agg.actual - agg.approved).toFixed(2),
    }));
  });
}

export async function fetchAdministrationDataAction() {
  return withActivePermission("organization", "read", async ({ legalEntityId, db }) => {
    const { data: entity } = await db
      .from("legal_entities")
      .select("name_en")
      .eq("id", legalEntityId)
      .single();

    const { data: memberships, error: memErr } = await db
      .from("memberships")
      .select("user_id")
      .eq("legal_entity_id", legalEntityId)
      .eq("status", "active");
    if (memErr) throw new DataAccessError(memErr.message, "DATABASE");

    const userIds = (memberships ?? []).map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("id, email, full_name_en, full_name_ar, status").in("id", userIds)
      : { data: [] };

    const { data: roles, error: roleErr } = await db
      .from("role_assignments")
      .select("id, user_id, scope_type, effective_start, effective_end, roles(code)")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    if (roleErr) throw new DataAccessError(roleErr.message, "DATABASE");

    return {
      legalEntityName: entity?.name_en ?? legalEntityId,
      profiles: profiles ?? [],
      roles: (roles ?? []).map((r) => {
        const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
        return {
          id: r.id,
          user_id: r.user_id,
          role_code: role?.code ?? "unknown",
          scope_type: r.scope_type,
          effective_start: r.effective_start,
          effective_end: r.effective_end,
        };
      }),
    };
  });
}

export async function fetchMasterRecordsAction(recordType?: string) {
  return withActivePermission("master_data", "read", async ({ legalEntityId, db }) => {
    let query = db
      .from("governed_master_records")
      .select("*")
      .eq("legal_entity_id", legalEntityId)
      .order("updated_at", { ascending: false });
    if (recordType) query = query.eq("record_type", recordType);
    const { data, error } = await query;
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function createMasterRecordDraftAction(params: {
  recordType: string;
  code: string;
  nameEn: string;
  nameAr: string;
  description?: string;
  parentId?: string;
  attributes?: Record<string, unknown>;
  changeReason?: string;
}) {
  return withActivePermission("master_data", "create", async ({ legalEntityId, db }) => {
    const result = await masterRecordCreateDraft(db, {
      legalEntityId,
      ...params,
    });
    const { data, error } = await db
      .from("governed_master_records")
      .select("*")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Master record not found.", "NOT_FOUND");
    return data;
  });
}

export async function createMasterRecordRevisionAction(params: {
  recordId: string;
  nameEn: string;
  nameAr: string;
  description?: string;
  parentId?: string;
  attributes?: Record<string, unknown>;
  effectiveStart?: string;
  effectiveEnd?: string;
  changeReason: string;
}) {
  return withActivePermission("master_data", "create", async ({ db }) => {
    const result = await masterRecordCreateRevision(db, params);
    const { data, error } = await db
      .from("governed_master_records")
      .select("*")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Master record revision not found.", "NOT_FOUND");
    return data;
  });
}

async function masterRecordTransition(
  recordId: string,
  rpc: string,
  expectedStatus: string,
) {
  return withActivePermission("master_data", "update", async ({ db }) => {
    const { error: rpcError } = await db.rpc(rpc, {
      p_record_id: recordId,
      p_expected_status: expectedStatus,
      p_idempotency_key: null,
      p_correlation_id: null,
    });
    if (rpcError) throw new DataAccessError(rpcError.message, "DATABASE");
    const { data, error } = await db
      .from("governed_master_records")
      .select("*")
      .eq("id", recordId)
      .single();
    if (error || !data) throw new DataAccessError("Master record not found.", "NOT_FOUND");
    return data;
  });
}

export async function submitMasterRecordAction(recordId: string) {
  return masterRecordTransition(recordId, "rpc_master_record_submit", "draft");
}

export async function approveMasterRecordAction(recordId: string) {
  return masterRecordTransition(recordId, "rpc_master_record_approve", "submitted");
}

export async function rejectMasterRecordAction(recordId: string, changeReason?: string) {
  return withActivePermission("master_data", "approve", async ({ db }) => {
    await masterRecordReject(db, { recordId, changeReason });
    const { data, error } = await db
      .from("governed_master_records")
      .select("*")
      .eq("id", recordId)
      .single();
    if (error || !data) throw new DataAccessError("Master record not found.", "NOT_FOUND");
    return data;
  });
}

export async function deactivateMasterRecordAction(recordId: string, changeReason?: string) {
  return withActivePermission("master_data", "update", async ({ db }) => {
    await masterRecordDeactivate(db, { recordId, changeReason });
    const { data, error } = await db
      .from("governed_master_records")
      .select("*")
      .eq("id", recordId)
      .single();
    if (error || !data) throw new DataAccessError("Master record not found.", "NOT_FOUND");
    return data;
  });
}

export async function fetchDelegationsAction() {
  return withActivePermission("approval", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("approval_delegations")
      .select("*")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function createDelegationDraftAction(params: {
  delegateId: string;
  workflowType: string;
  permissionCode: string;
  effectiveStart: string;
  effectiveEnd: string;
  reason: string;
  financialThreshold?: string;
}) {
  return withActivePermission("approval", "create", async ({ legalEntityId, db }) => {
    const result = await delegationCreateDraft(db, { legalEntityId, ...params });
    const { data, error } = await db
      .from("approval_delegations")
      .select("*")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Delegation not found.", "NOT_FOUND");
    return data;
  });
}

export async function fetchRequisitionsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("purchase_requisitions")
      .select("*")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function createRequisitionDraftAction(params: {
  requisitionNumber: string;
  titleEn: string;
  titleAr: string;
  fiscalPeriodId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ legalEntityId, db }) => {
    const result = await requisitionCreateDraft(db, { legalEntityId, ...params });
    const { data, error } = await db
      .from("purchase_requisitions")
      .select("*")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Requisition not found.", "NOT_FOUND");
    return data;
  });
}

export async function submitRequisitionAction(requisitionId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await requisitionSubmit(db, requisitionId);
    const { data, error } = await db
      .from("purchase_requisitions")
      .select("*")
      .eq("id", requisitionId)
      .single();
    if (error || !data) throw new DataAccessError("Requisition not found.", "NOT_FOUND");
    return data;
  });
}

async function reloadPeriodControls(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("fiscal_period_module_controls")
    .select("*, fiscal_periods(period_number, start_date, end_date, fiscal_year_id)")
    .eq("legal_entity_id", legalEntityId)
    .order("updated_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function fetchPeriodControlsAction() {
  return withActivePermission("period_close", "read", async ({ legalEntityId, db }) =>
    reloadPeriodControls(db, legalEntityId),
  );
}

export async function fetchPeriodChecklistAction(params: {
  fiscalPeriodId: string;
  module: string;
}) {
  return withActivePermission("period_close", "read", async ({ legalEntityId, db }) =>
    getPeriodChecklistWorkspace(db, legalEntityId, params.fiscalPeriodId, params.module),
  );
}

export async function fetchPeriodTemplatesAction() {
  return withActivePermission("period_close", "read", async ({ legalEntityId, db }) =>
    listPeriodCloseTemplates(db, legalEntityId),
  );
}

export async function createPeriodTemplateAction(params: {
  module: string;
  code: string;
  nameEn: string;
  nameAr: string;
  effectiveFrom?: string;
}) {
  return withActivePermission("period_close", "create", async ({ legalEntityId, db }) => {
    await periodTemplateCreate(db, { legalEntityId, ...params });
    return listPeriodCloseTemplates(db, legalEntityId);
  });
}

export async function addPeriodTemplateItemAction(params: {
  templateId: string;
  sequenceNo: number;
  nameEn: string;
  nameAr: string;
  description?: string;
  itemType: "manual" | "automatic";
  ownerRoleCode?: string;
  isRequired: boolean;
  isBlocking: boolean;
  controlCode?: string;
}) {
  return withActivePermission("period_close", "update", async ({ legalEntityId, db }) => {
    await periodTemplateAddItem(db, params);
    return listPeriodCloseTemplates(db, legalEntityId);
  });
}

export async function submitPeriodTemplateAction(templateId: string) {
  return withActivePermission("period_close", "update", async ({ legalEntityId, db }) => {
    await periodTemplateSubmit(db, templateId);
    return listPeriodCloseTemplates(db, legalEntityId);
  });
}

export async function approvePeriodTemplateAction(templateId: string) {
  return withActivePermission("period_close", "approve", async ({ legalEntityId, db }) => {
    await periodTemplateApprove(db, templateId);
    return listPeriodCloseTemplates(db, legalEntityId);
  });
}

export async function retirePeriodTemplateAction(params: { templateId: string; reason: string }) {
  return withActivePermission("period_close", "approve", async ({ legalEntityId, db }) => {
    await periodTemplateRetire(db, params);
    return listPeriodCloseTemplates(db, legalEntityId);
  });
}

export async function evaluatePeriodReadinessAction(params: {
  fiscalPeriodId: string;
  module: string;
}) {
  return withActivePermission("period_close", "read", async ({ legalEntityId, db }) =>
    periodCloseEvaluateReadiness(db, {
      fiscalPeriodId: params.fiscalPeriodId,
      legalEntityId,
      module: params.module,
    }),
  );
}

export async function softClosePeriodAction(params: {
  fiscalPeriodId: string;
  module: string;
}) {
  return withActivePermission("period_close", "approve", async ({ legalEntityId, db }) => {
    await periodSoftClose(db, {
      fiscalPeriodId: params.fiscalPeriodId,
      legalEntityId,
      module: params.module,
    });
    return reloadPeriodControls(db, legalEntityId);
  });
}

export async function fetchApprovalRulesAction() {
  return withActivePermission("approval", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("approval_rule_versions")
      .select("*")
      .eq("legal_entity_id", legalEntityId)
      .order("version_number", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function fetchProfilesForDelegationAction() {
  return withActivePermission("approval", "read", async ({ db }) => {
    const { data, error } = await db
      .from("profiles")
      .select("id, email, full_name_en, full_name_ar")
      .order("full_name_en");
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return (data ?? []).filter((p) => p.id);
  });
}

async function reloadDelegation(db: SupabaseClient, delegationId: string) {
  const { data, error } = await db
    .from("approval_delegations")
    .select("*")
    .eq("id", delegationId)
    .single();
  if (error || !data) throw new DataAccessError("Delegation not found.", "NOT_FOUND");
  return data;
}

export async function submitDelegationAction(delegationId: string) {
  return withActivePermission("approval", "update", async ({ db }) => {
    await delegationSubmit(db, delegationId);
    return reloadDelegation(db, delegationId);
  });
}

export async function approveDelegationAction(delegationId: string) {
  return withActivePermission("approval", "approve", async ({ db }) => {
    await delegationApprove(db, delegationId);
    return reloadDelegation(db, delegationId);
  });
}

export async function activateDelegationAction(delegationId: string) {
  return withActivePermission("approval", "approve", async ({ db }) => {
    await delegationActivate(db, delegationId);
    return reloadDelegation(db, delegationId);
  });
}

export async function revokeDelegationAction(delegationId: string) {
  return withActivePermission("approval", "update", async ({ db }) => {
    await delegationRevoke(db, delegationId);
    return reloadDelegation(db, delegationId);
  });
}

export async function cancelDelegationAction(delegationId: string) {
  return withActivePermission("approval", "update", async ({ db }) => {
    await delegationCancel(db, delegationId);
    return reloadDelegation(db, delegationId);
  });
}

export async function hardClosePeriodAction(params: {
  fiscalPeriodId: string;
  module: string;
}) {
  return withActivePermission("period_close", "approve", async ({ legalEntityId, db }) => {
    await periodHardCloseGated(db, {
      fiscalPeriodId: params.fiscalPeriodId,
      legalEntityId,
      module: params.module,
    });
    return reloadPeriodControls(db, legalEntityId);
  });
}

export async function setPeriodChecklistResultAction(params: {
  itemResultId: string;
  fiscalPeriodId: string;
  module: string;
  itemStatus: "passed" | "failed" | "waived";
  evidenceReference?: string;
  comments?: string;
  waiverReason?: string;
}) {
  return withActivePermission("period_close", "approve", async ({ legalEntityId, db }) => {
    await periodChecklistSetResult(db, params);
    return getPeriodChecklistWorkspace(db, legalEntityId, params.fiscalPeriodId, params.module);
  });
}

export async function requestPeriodReopenAction(params: {
  fiscalPeriodId: string;
  module: string;
  reason: string;
  evidenceReference?: string;
}) {
  return withActivePermission("period_close", "create", async ({ legalEntityId, db }) => {
    await periodReopenRequest(db, {
      fiscalPeriodId: params.fiscalPeriodId,
      legalEntityId,
      module: params.module,
      reason: params.reason,
      evidenceReference: params.evidenceReference,
    });
    return getPeriodChecklistWorkspace(db, legalEntityId, params.fiscalPeriodId, params.module);
  });
}

export async function approvePeriodReopenAction(params: {
  reopenRequestId: string;
  fiscalPeriodId: string;
  module: string;
  decisionReason?: string;
}) {
  return withActivePermission("period_close", "approve", async ({ legalEntityId, db }) => {
    await periodReopenApprove(db, {
      reopenRequestId: params.reopenRequestId,
      decisionReason: params.decisionReason,
    });
    const [controls, checklist] = await Promise.all([
      reloadPeriodControls(db, legalEntityId),
      getPeriodChecklistWorkspace(db, legalEntityId, params.fiscalPeriodId, params.module),
    ]);
    return { controls, checklist };
  });
}

export async function fetchPurchaseOrdersAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("purchase_orders")
      .select("*, vendors(name_en, name_ar)")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function fetchSupplierInvoicesAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("supplier_invoices")
      .select("*, purchase_orders(po_number), vendors(name_en, name_ar)")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function fetchPaymentRequestsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("payment_requests")
      .select("*, supplier_invoices(invoice_number)")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function fetchBudgetVsActualWorkspaceAction() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const workspace = await loadBudgetVsActualWorkspaceData(db, legalEntityId, FISCAL_YEAR_2027);

    return {
      revenueRows: workspace.revenueRows,
      expenseRows: workspace.expenseRows,
      profitabilityRows: workspace.profitabilityRows,
      payers: workspace.payers.map((p) => ({
        id: p.id as string,
        labelEn: p.name_en as string,
        labelAr: p.name_ar as string,
      })),
      serviceLines: workspace.serviceLines.map((s) => ({
        id: s.id as string,
        labelEn: s.name_en as string,
        labelAr: s.name_ar as string,
      })),
      fiscalPeriods: workspace.fiscalPeriods.map((fp) => ({
        id: fp.id,
        period_number: fp.period_number,
      })),
    };
  });
}
