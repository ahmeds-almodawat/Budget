import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { calculateEarnedValue } from "@/domain/financial/calculations";
import { money } from "@/lib/money";
import { searchAuditEvents } from "@/data/repositories/audit-repository";

export type ReportType =
  | "budget_vs_actual"
  | "budget_actual_commitments"
  | "forecast_at_completion"
  | "monthly_cash_flow"
  | "milestone_performance"
  | "restaurant_operational"
  | "project_cost_phase_category"
  | "team_milestone_performance"
  | "variance_explanations"
  | "unmapped_actuals"
  | "audit_history"
  | "procurement_pipeline"
  | "invoice_match_exceptions"
  | "period_close_readiness"
  | "appraisal_cycle_completion";

export async function getBudgetVsActualReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("v_budget_vs_actual")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

async function getProjectIdsForLegalEntity(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("projects")
    .select("id, control_scopes!inner(legal_entity_id)")
    .eq("control_scopes.legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []).map((project) => project.id);
}

export async function getMilestonePerformanceReport(db: SupabaseClient, legalEntityId: string) {
  const projectIds = await getProjectIdsForLegalEntity(db, legalEntityId);
  if (projectIds.length === 0) return [];
  const { data, error } = await db
    .from("milestones")
    .select("code, name_en, name_ar, baseline_date, forecast_date, approved_progress, reported_progress, approval_status, projects(control_scopes(name_en))")
    .in("project_id", projectIds)
    .order("baseline_date");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getRestaurantReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("v_restaurant_branch_performance")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getUnmappedActualsReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("unmapped_transaction_queue")
    .select("*, import_batches!inner(legal_entity_id)")
    .eq("import_batches.legal_entity_id", legalEntityId)
    .eq("status", "open");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getForecastAtCompletionReport(db: SupabaseClient, legalEntityId: string) {
  const projectIds = await getProjectIdsForLegalEntity(db, legalEntityId);
  if (projectIds.length === 0) return [];
  const { data, error } = await db
    .from("v_project_earned_value")
    .select("project_id, control_account_id, status_date, bac, pv, ev, ac")
    .in("project_id", projectIds);
  if (error) throw new DataAccessError(error.message, "DATABASE");

  return (data ?? []).map((row) => {
    const result = calculateEarnedValue({
      budgetAtCompletion: row.bac ?? 0,
      plannedValue: row.pv ?? 0,
      earnedValue: row.ev ?? 0,
      actualCost: row.ac ?? 0,
    });
    return {
      project_id: row.project_id,
      control_account_id: row.control_account_id,
      status_date: row.status_date,
      bac: result.budgetAtCompletion.toFixed(4),
      pv: result.plannedValue.toFixed(4),
      ev: result.earnedValue.toFixed(4),
      ac: result.actualCost.toFixed(4),
      cv: result.costVariance.toFixed(4),
      sv: result.scheduleVariance.toFixed(4),
      cpi: result.costPerformanceIndex?.toFixed(4) ?? null,
      spi: result.schedulePerformanceIndex?.toFixed(4) ?? null,
      eac: result.estimateAtCompletion?.toFixed(4) ?? null,
      etc: result.estimateToComplete?.toFixed(4) ?? null,
      vac: result.varianceAtCompletion?.toFixed(4) ?? null,
    };
  });
}

export async function getMonthlyCashFlowReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("actual_transactions")
    .select("transaction_date, payment_date, amount_inc_vat, is_reversal")
    .eq("legal_entity_id", legalEntityId)
    .eq("is_posted", true)
    .order("transaction_date");
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const totals = new Map<string, ReturnType<typeof money>>();
  for (const row of data ?? []) {
    const date = row.payment_date ?? row.transaction_date;
    const period = date.slice(0, 7);
    const signed = money(row.amount_inc_vat ?? 0).times(row.is_reversal ? -1 : 1);
    totals.set(period, (totals.get(period) ?? money(0)).plus(signed));
  }
  return [...totals.entries()].map(([period, cashOutflow]) => ({
    period,
    cash_outflow: cashOutflow.toFixed(4),
  }));
}

export async function getProjectCostByPhaseReport(db: SupabaseClient, legalEntityId: string) {
  const projectIds = await getProjectIdsForLegalEntity(db, legalEntityId);
  if (projectIds.length === 0) return [];
  const { data: values, error } = await db
    .from("v_project_earned_value")
    .select("project_id, control_account_id, bac, ac")
    .in("project_id", projectIds);
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const accountIds = (values ?? []).map((row) => row.control_account_id);
  const { data: accounts, error: accountError } = accountIds.length
    ? await db
        .from("control_accounts")
        .select("id, code, name_en, name_ar, project_phases(code, name_en, name_ar), cost_nodes(code, name_en, name_ar)")
        .in("id", accountIds)
    : { data: [], error: null };
  if (accountError) throw new DataAccessError(accountError.message, "DATABASE");

  const byId = new Map((accounts ?? []).map((account) => [account.id, account]));
  return (values ?? []).map((row) => {
    const account = byId.get(row.control_account_id);
    return {
      project_id: row.project_id,
      control_account_code: account?.code ?? row.control_account_id,
      control_account_name_en: account?.name_en ?? null,
      control_account_name_ar: account?.name_ar ?? null,
      phase: account?.project_phases ?? null,
      cost_category: account?.cost_nodes ?? null,
      budget_at_completion: row.bac,
      actual_cost: row.ac,
    };
  });
}

export async function getTeamMilestonePerformanceReport(db: SupabaseClient, legalEntityId: string) {
  const { data: teams, error: teamError } = await db
    .from("teams")
    .select("id, code, name_en, name_ar")
    .eq("legal_entity_id", legalEntityId)
    .order("code");
  if (teamError) throw new DataAccessError(teamError.message, "DATABASE");

  const { data: milestones, error: milestoneError } = await db
    .from("milestones")
    .select("responsible_team_id, approved_progress, baseline_date, actual_date");
  if (milestoneError) throw new DataAccessError(milestoneError.message, "DATABASE");

  return (teams ?? []).map((team) => {
    const assigned = (milestones ?? []).filter((row) => row.responsible_team_id === team.id);
    const completedOnTime = assigned.filter(
      (row) => row.actual_date && row.baseline_date && row.actual_date <= row.baseline_date,
    ).length;
    const progressTotal = assigned.reduce(
      (sum, row) => sum.plus(money(row.approved_progress ?? 0)),
      money(0),
    );
    return {
      team_code: team.code,
      team_name_en: team.name_en,
      team_name_ar: team.name_ar,
      milestone_count: assigned.length,
      completed_on_time: completedOnTime,
      average_approved_progress: assigned.length
        ? progressTotal.div(assigned.length).toFixed(4)
        : "0.0000",
    };
  });
}

export async function getVarianceExplanationsReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("variance_explanations")
    .select("id, control_account_id, fiscal_period_id, variance_category, variance_amount, cause, financial_impact, schedule_impact_days, corrective_action, target_resolution_date, approval_status, created_at")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getAuditHistoryReport(db: SupabaseClient, legalEntityId: string) {
  return searchAuditEvents(db, legalEntityId, { limit: 200 });
}

export async function getProcurementPipelineReport(db: SupabaseClient, legalEntityId: string) {
  const [requisitions, rfqs, awards, purchaseOrders] = await Promise.all([
    db
      .from("purchase_requisitions")
      .select("id, requisition_number, requisition_status, estimated_total, submitted_at, approved_at")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("rfqs")
      .select("id, rfq_number, rfq_status, requisition_id, created_at")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("sourcing_awards")
      .select("id, award_status, total_amount, vendor_id, rfq_id, submitted_at, approved_at")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("purchase_orders")
      .select("id, po_number, po_status, total_amount, vendor_id, award_id, issued_at")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  for (const result of [requisitions, rfqs, awards, purchaseOrders]) {
    if (result.error) throw new DataAccessError(result.error.message, "DATABASE");
  }

  const rows: Record<string, unknown>[] = [];
  for (const row of requisitions.data ?? []) {
    rows.push({ stage: "requisition", document_number: row.requisition_number, status: row.requisition_status, amount: row.estimated_total, reference_id: row.id });
  }
  for (const row of rfqs.data ?? []) {
    rows.push({ stage: "rfq", document_number: row.rfq_number, status: row.rfq_status, amount: null, reference_id: row.id });
  }
  for (const row of awards.data ?? []) {
    rows.push({ stage: "award", document_number: row.id, status: row.award_status, amount: row.total_amount, reference_id: row.id });
  }
  for (const row of purchaseOrders.data ?? []) {
    rows.push({ stage: "purchase_order", document_number: row.po_number, status: row.po_status, amount: row.total_amount, reference_id: row.id });
  }
  return rows;
}

export async function getInvoiceMatchExceptionsReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("invoice_match_exceptions")
    .select(
      "id, exception_code, severity, message, amount, is_resolved, created_at, supplier_invoices!inner(id, invoice_number, legal_entity_id, match_status, gross_amount)",
    )
    .eq("supplier_invoices.legal_entity_id", legalEntityId)
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []).map((row) => {
    const invoice = Array.isArray(row.supplier_invoices) ? row.supplier_invoices[0] : row.supplier_invoices;
    return {
      exception_id: row.id,
      invoice_number: invoice?.invoice_number ?? null,
      match_status: invoice?.match_status ?? null,
      exception_code: row.exception_code,
      severity: row.severity,
      message: row.message,
      amount: row.amount,
      invoice_gross: invoice?.gross_amount ?? null,
      created_at: row.created_at,
    };
  });
}

export async function getPeriodCloseReadinessReport(db: SupabaseClient, legalEntityId: string) {
  const { data: controls, error } = await db
    .from("fiscal_period_module_controls")
    .select("id, module, control_state, fiscal_period_id, fiscal_periods(period_number, start_date, end_date)")
    .eq("legal_entity_id", legalEntityId)
    .order("module");
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const { data: instances, error: instanceError } = await db
    .from("period_close_instances")
    .select("id, fiscal_period_id, module, readiness_snapshot")
    .eq("legal_entity_id", legalEntityId);
  if (instanceError) throw new DataAccessError(instanceError.message, "DATABASE");

  const { data: results, error: resultsError } = await db
    .from("period_close_item_results")
    .select("instance_id, item_status, checklist_item_id, period_close_checklist_items(is_blocking, name_en)");
  if (resultsError) throw new DataAccessError(resultsError.message, "DATABASE");

  const byKey = new Map((instances ?? []).map((row) => [`${row.fiscal_period_id}:${row.module}`, row]));

  return (controls ?? []).map((control) => {
    const period = Array.isArray(control.fiscal_periods) ? control.fiscal_periods[0] : control.fiscal_periods;
    const instance = byKey.get(`${control.fiscal_period_id}:${control.module}`);
    const itemRows = (results ?? []).filter((row) => row.instance_id === instance?.id);
    const blockingIncomplete = itemRows.filter((row) => {
      const item = Array.isArray(row.period_close_checklist_items)
        ? row.period_close_checklist_items[0]
        : row.period_close_checklist_items;
      return item?.is_blocking && !["passed", "waived"].includes(row.item_status);
    }).length;
    return {
      module: control.module,
      control_state: control.control_state,
      period_number: period?.period_number ?? null,
      period_start: period?.start_date ?? null,
      period_end: period?.end_date ?? null,
      checklist_items: itemRows.length,
      blocking_incomplete: blockingIncomplete,
      ready_for_hard_close: control.control_state === "soft_close" && blockingIncomplete === 0,
    };
  });
}

/** Aggregate-only appraisal cycle completion (no narrative comments). */
export async function getAppraisalCycleCompletionReport(db: SupabaseClient, legalEntityId: string) {
  const { data: cycles, error } = await db
    .from("appraisal_cycles")
    .select("id, name_en, name_ar, cycle_status, period_start, period_end")
    .eq("legal_entity_id", legalEntityId)
    .order("period_start", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const { data: assignments, error: assignmentError } = await db
    .from("appraisal_assignments")
    .select("id, cycle_id, assignment_status, final_score")
    .eq("legal_entity_id", legalEntityId);
  if (assignmentError) throw new DataAccessError(assignmentError.message, "DATABASE");

  return (cycles ?? []).map((cycle) => {
    const rows = (assignments ?? []).filter((row) => row.cycle_id === cycle.id);
    const finalized = rows.filter((row) =>
      ["finalized", "employee_acknowledged"].includes(row.assignment_status),
    ).length;
    const acknowledged = rows.filter((row) => row.assignment_status === "employee_acknowledged").length;
    const scored = rows.filter((row) => row.final_score != null);
    const avgScore =
      scored.length === 0
        ? null
        : scored.reduce((sum, row) => sum + Number(row.final_score ?? 0), 0) / scored.length;
    return {
      cycle_id: cycle.id,
      cycle_name_en: cycle.name_en,
      cycle_name_ar: cycle.name_ar,
      cycle_status: cycle.cycle_status,
      period_start: cycle.period_start,
      period_end: cycle.period_end,
      assignment_count: rows.length,
      finalized_count: finalized,
      acknowledged_count: acknowledged,
      completion_rate: rows.length === 0 ? 0 : Number(((finalized / rows.length) * 100).toFixed(2)),
      average_final_score: avgScore == null ? null : Number(avgScore.toFixed(4)),
    };
  });
}
