"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { AuthError } from "@/lib/auth/errors";
import {
  DataAccessError,
  createDraftBudgetVersion,
  transitionBudgetVersion,
} from "@/data/repositories/budget-repository";
import {
  getPayers,
  getServiceLines,
  getRevenueComponentTypes,
  getPayerCategories,
} from "@/data/repositories/revenue-repository";
import { getOrganizationUnits, getLeafCostNodes } from "@/data/repositories/budget-repository";
import {
  CONTROL_SCOPE_REST_BUDGET_2027,
  COST_NODE_REVENUE,
  FISCAL_YEAR_2027,
  type BudgetLineInput,
  type RevenueBudgetBasis,
} from "@/types/database";
import { validateRevenueBasisConsistency } from "@/domain/financial/revenue-budget";

export interface SaveRevenueBudgetInput {
  basis: RevenueBudgetBasis;
  organizationUnitId: string;
  payerId?: string;
  serviceLineId?: string;
  lines: BudgetLineInput[];
}

async function resolveRestBudgetScopeId(
  db: Parameters<typeof createDraftBudgetVersion>[0],
  legalEntityId: string,
): Promise<string> {
  const { data, error } = await db
    .from("control_scopes")
    .select("id")
    .eq("legal_entity_id", legalEntityId)
    .eq("code", "REST-BUD-2027")
    .maybeSingle();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data?.id ?? CONTROL_SCOPE_REST_BUDGET_2027;
}

export async function fetchRevenueBudgetMasterDataAction() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const [units, payers, serviceLines, componentTypes, payerCategories] = await Promise.all([
      getOrganizationUnits(db, legalEntityId),
      getPayers(db, legalEntityId),
      getServiceLines(db, legalEntityId),
      getRevenueComponentTypes(db),
      getPayerCategories(db),
    ]);
    const costNodes = (await getLeafCostNodes(db, legalEntityId)).filter(
      (n) => n.code === "REV" || (n as { classification?: string }).classification === "revenue",
    );
    return {
      units,
      payers,
      serviceLines,
      componentTypes,
      payerCategories,
      costNodes,
      defaultCostNodeId: COST_NODE_REVENUE,
      activeLegalEntityId: legalEntityId,
    };
  });
}

export async function fetchLatestRevenueBudgetVersionAction() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const scopeId = await resolveRestBudgetScopeId(db, legalEntityId);
    const { data, error } = await db
      .from("budget_versions")
      .select("id, version_label, approval_status, is_current_approved")
      .eq("legal_entity_id", legalEntityId)
      .eq("control_scope_id", scopeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  });
}

export async function saveRevenueDraftBudgetAction(input: SaveRevenueBudgetInput) {
  return withActivePermission("budget", "create", async ({ ctx, legalEntityId, db }) => {
    validateRevenueBasisConsistency(input.lines.map((l) => l.revenueBudgetBasis ?? input.basis));

    if (input.basis === "net_only" && input.lines.length !== 1) {
      throw new DataAccessError("Net-only revenue budget requires exactly one summary line.", "VALIDATION");
    }
    if (input.basis === "component_based") {
      const hasGross = input.lines.some((l) => l.revenueComponentTypeId);
      if (!hasGross || input.lines.length < 1) {
        throw new DataAccessError("Component-based budget requires component lines.", "VALIDATION");
      }
    }

    const normalized: BudgetLineInput[] = input.lines.map((line) => ({
      ...line,
      organizationUnitId: line.organizationUnitId || input.organizationUnitId,
      costNodeId: line.costNodeId || COST_NODE_REVENUE,
      payerId: line.payerId ?? input.payerId,
      serviceLineId: line.serviceLineId ?? input.serviceLineId,
      revenueBudgetBasis: input.basis,
    }));

    const controlScopeId = await resolveRestBudgetScopeId(db, legalEntityId);
    return createDraftBudgetVersion(db, {
      legalEntityId,
      controlScopeId,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `REV-DRAFT-${Date.now()}`,
      createdBy: ctx.userId,
      lines: normalized,
    });
  });
}

export async function submitRevenueBudgetAction(budgetVersionId: string) {
  return withActivePermission("budget", "update", async ({ ctx, db }) => {
    const { data: version } = await db
      .from("budget_versions")
      .select("approval_status")
      .eq("id", budgetVersionId)
      .single();
    if (!version || version.approval_status !== "draft") {
      throw new AuthError("Only draft budgets can be submitted.", "FORBIDDEN");
    }
    return transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "submitted",
      actorId: ctx.userId,
    });
  });
}
