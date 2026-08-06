import { describe, it, expect, beforeAll } from "vitest";
import {
  getBudgetVsActualDetail,
  getProfitabilityPerformance,
  getRevenueBudgetVsActual,
  loadBudgetVsActualWorkspaceData,
} from "@/data/repositories/revenue-repository";
import { createDraftBudgetVersion, transitionBudgetVersion, getFiscalPeriods } from "@/data/repositories/budget-repository";
import {
  CONTROL_SCOPE_REST_BUDGET_2027,
  COST_NODE_REVENUE,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
} from "@/types/database";
import { TEST_USER_IDS } from "@/test/fixtures/users";
import { REVENUE_FIXTURE } from "@/test/fixtures/revenue-control";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

const ENTITY = LEGAL_ENTITY_MODAWAT;
const {
  organizationUnitRestB1: REST_B1,
  organizationUnitRestB2: REST_B2,
  fiscalPeriodMarNumber: PERIOD_MAR_NUMBER,
  payerGov: PAYER_GOV,
  payerInsurance: PAYER_INS,
  serviceLineDineIn: SL_DINE,
  restB1ExternalNetMar,
  restB2ExternalNetMar,
  internalRevenueMar,
} = REVENUE_FIXTURE;
const NONEXISTENT_PAYER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa99";
let fiscalPeriodMarId = "";

async function resolveFiscalPeriodMarId() {
  if (fiscalPeriodMarId) return fiscalPeriodMarId;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
  }
  const db = await createAuthenticatedTestClient("finance");
  const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
  fiscalPeriodMarId = periods.find((p) => p.period_number === PERIOD_MAR_NUMBER)?.id ?? "";
  if (!fiscalPeriodMarId) {
    throw new Error("March FY2027 fiscal period not found — run db:fixtures:local after reset");
  }
  return fiscalPeriodMarId;
}

describe.skipIf(!hasDb)("revenue repository integration", () => {
  beforeAll(async () => {
    await resolveFiscalPeriodMarId();
  });

  it("retrieves revenue report with no filters", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const restB1Mar = rows.find(
      (r) =>
        r.organization_unit_id === REST_B1 &&
        r.fiscal_period_id === fiscalPeriodMarId &&
        r.payer_id === PAYER_GOV &&
        r.service_line_id === SL_DINE,
    );
    expect(restB1Mar).toBeDefined();
    expect(Number(restB1Mar!.external_net_revenue)).toBe(restB1ExternalNetMar);
    expect(Number(restB1Mar!.budgeted_revenue)).toBe(0);
    expect(Number(restB1Mar!.gross_actual_revenue)).toBe(restB1ExternalNetMar);
  });

  it("filters by payer category (government includes REST-B1 actual)", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const { data: categories } = await db.from("payer_categories").select("id").eq("code", "government").single();
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { payerCategoryId: categories!.id });
    const restB1 = rows.find(
      (r) => r.organization_unit_id === REST_B1 && r.fiscal_period_id === fiscalPeriodMarId,
    );
    expect(restB1).toBeDefined();
    expect(Number(restB1!.external_net_revenue)).toBe(restB1ExternalNetMar);
    const { data: insurance } = await db.from("payer_categories").select("id").eq("code", "insurance").single();
    const insuranceRows = await getRevenueBudgetVsActual(db, ENTITY, { payerCategoryId: insurance!.id });
    expect(
      insuranceRows.some(
        (r) => r.organization_unit_id === REST_B1 && Number(r.external_net_revenue) === restB1ExternalNetMar,
      ),
    ).toBe(false);
  });

  it("filters by specific payer", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { payerId: PAYER_GOV });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.payer_id === PAYER_GOV)).toBe(true);
    const mar = rows.find((r) => r.fiscal_period_id === fiscalPeriodMarId && r.organization_unit_id === REST_B1);
    expect(mar).toBeDefined();
    expect(Number(mar!.external_net_revenue)).toBe(restB1ExternalNetMar);
  });

  it("filters by service line", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { serviceLineId: SL_DINE });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.service_line_id === SL_DINE)).toBe(true);
    const mar = rows.find((r) => r.organization_unit_id === REST_B1);
    expect(mar && Number(mar.external_net_revenue)).toBe(restB1ExternalNetMar);
  });

  it("filters by fiscal period", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { fiscalPeriodId: fiscalPeriodMarId });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.fiscal_period_id === fiscalPeriodMarId)).toBe(true);
    const marB1 = rows.find((r) => r.organization_unit_id === REST_B1 && r.payer_id === PAYER_GOV);
    expect(marB1 && Number(marB1.external_net_revenue)).toBe(restB1ExternalNetMar);
  });

  it("filters by organization unit", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { organizationUnitId: REST_B1 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organization_unit_id === REST_B1)).toBe(true);
    const mar = rows.find((r) => r.fiscal_period_id === fiscalPeriodMarId && r.payer_id === PAYER_GOV);
    expect(mar && Number(mar.external_net_revenue)).toBe(restB1ExternalNetMar);
  });

  it("applies combined payer and service-line filters", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const matching = await getRevenueBudgetVsActual(db, ENTITY, {
      payerId: PAYER_GOV,
      serviceLineId: SL_DINE,
      fiscalPeriodId: fiscalPeriodMarId,
      organizationUnitId: REST_B1,
    });
    expect(matching.length).toBe(1);
    expect(Number(matching[0].external_net_revenue)).toBe(restB1ExternalNetMar);

    const nonMatching = await getRevenueBudgetVsActual(db, ENTITY, {
      payerId: PAYER_INS,
      serviceLineId: SL_DINE,
      fiscalPeriodId: fiscalPeriodMarId,
      organizationUnitId: REST_B1,
    });
    expect(nonMatching.length).toBe(0);
  });

  it("returns actual-only rows (budget zero, actual positive)", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, {
      fiscalPeriodId: fiscalPeriodMarId,
      organizationUnitId: REST_B1,
      payerId: PAYER_GOV,
      serviceLineId: SL_DINE,
    });
    expect(rows.length).toBe(1);
    expect(Number(rows[0].budgeted_revenue)).toBe(0);
    expect(Number(rows[0].external_net_revenue)).toBe(restB1ExternalNetMar);
  });

  it("returns budget-only rows after approved net-only budget on unmatched payer", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");
    const monthly = Array(12).fill("5000.0000");
    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: ENTITY,
      controlScopeId: CONTROL_SCOPE_REST_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-NET-ONLY-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: REST_B1,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "60000.0000",
          monthlyAmounts: monthly,
          revenueBudgetBasis: "net_only",
          payerId: PAYER_INS,
        },
      ],
    });
    await transitionBudgetVersion(ownerDb, { budgetVersionId: version.id, nextStatus: "submitted", actorId: TEST_USER_IDS.budgetOwner });
    await transitionBudgetVersion(financeDb, { budgetVersionId: version.id, nextStatus: "under_review", actorId: TEST_USER_IDS.finance });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "approved",
      actorId: TEST_USER_IDS.approver,
      lockOriginalAmount: "60000.0000",
    });
    const rows = await getRevenueBudgetVsActual(financeDb, ENTITY, {
      organizationUnitId: REST_B1,
      payerId: PAYER_INS,
      fiscalPeriodId: fiscalPeriodMarId,
    });
    expect(rows.length).toBe(1);
    expect(Number(rows[0].budgeted_revenue)).toBe(5000);
    expect(Number(rows[0].external_net_revenue)).toBe(0);
  });

  it("returns empty result for non-matching payer filter", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { payerId: NONEXISTENT_PAYER });
    expect(rows.length).toBe(0);
  });

  it("isolates unauthorized legal entity access", async () => {
    const otherDb = await createAuthenticatedTestClient("otherFinance");
    const rows = await getRevenueBudgetVsActual(otherDb, ENTITY);
    expect(rows.length).toBe(0);
  });

  it("separates internal revenue from external consolidated revenue", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, {
      fiscalPeriodId: fiscalPeriodMarId,
      organizationUnitId: REST_B1,
    });
    const externalRow = rows.find((r) => r.payer_id === PAYER_GOV);
    const internalRow = rows.find((r) => Number(r.internal_revenue) > 0);
    expect(externalRow).toBeDefined();
    expect(Number(externalRow!.external_net_revenue)).toBe(restB1ExternalNetMar);
    expect(internalRow).toBeDefined();
    expect(Number(internalRow!.internal_revenue)).toBe(internalRevenueMar);
    expect(Number(internalRow!.external_net_revenue)).toBe(0);
  });

  it("retrieves component-based budget lines after approval", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");
    const { data: grossType } = await ownerDb.from("revenue_component_types").select("id").eq("code", "gross_revenue").single();
    const { data: rejType } = await ownerDb.from("revenue_component_types").select("id").eq("code", "rejection").single();
    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: ENTITY,
      controlScopeId: CONTROL_SCOPE_REST_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-COMP-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: REST_B2,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "120000.0000",
          monthlyAmounts: Array(12).fill("10000.0000"),
          revenueBudgetBasis: "component_based",
          revenueComponentTypeId: grossType!.id,
        },
        {
          organizationUnitId: REST_B2,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "12000.0000",
          monthlyAmounts: Array(12).fill("1000.0000"),
          revenueBudgetBasis: "component_based",
          revenueComponentTypeId: rejType!.id,
        },
      ],
    });
    await transitionBudgetVersion(ownerDb, { budgetVersionId: version.id, nextStatus: "submitted", actorId: TEST_USER_IDS.budgetOwner });
    await transitionBudgetVersion(financeDb, { budgetVersionId: version.id, nextStatus: "under_review", actorId: TEST_USER_IDS.finance });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "approved",
      actorId: TEST_USER_IDS.approver,
      lockOriginalAmount: "108000.0000",
    });
    const detail = await getBudgetVsActualDetail(financeDb, ENTITY, {
      organizationUnitId: REST_B2,
      fiscalPeriodId: fiscalPeriodMarId,
    });
    const grossLine = detail.find(
      (r) => r.financial_classification === "revenue" && Number(r.monthly_budget) === 10000,
    );
    const rejLine = detail.find(
      (r) => r.financial_classification === "revenue" && Number(r.monthly_budget) === 1000,
    );
    expect(grossLine).toBeDefined();
    expect(rejLine).toBeDefined();
  });

  it("retrieves net-only budget lines after approval", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");
    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: ENTITY,
      controlScopeId: CONTROL_SCOPE_REST_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-NET-RETRIEVE-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: REST_B2,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "24000.0000",
          monthlyAmounts: Array(12).fill("2000.0000"),
          revenueBudgetBasis: "net_only",
          payerId: PAYER_INS,
        },
      ],
    });
    await transitionBudgetVersion(ownerDb, { budgetVersionId: version.id, nextStatus: "submitted", actorId: TEST_USER_IDS.budgetOwner });
    await transitionBudgetVersion(financeDb, { budgetVersionId: version.id, nextStatus: "under_review", actorId: TEST_USER_IDS.finance });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "approved",
      actorId: TEST_USER_IDS.approver,
      lockOriginalAmount: "24000.0000",
    });
    const { data: lines } = await financeDb
      .from("budget_lines")
      .select("revenue_budget_basis, planned_amount")
      .eq("budget_version_id", version.id);
    expect(lines?.length).toBe(1);
    expect(lines![0].revenue_budget_basis).toBe("net_only");
    expect(Number(lines![0].planned_amount)).toBe(24000);
  });

  it("retrieves profitability with CAPEX excluded from operating contribution", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getProfitabilityPerformance(db, ENTITY, { fiscalPeriodId: fiscalPeriodMarId });
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    const net = Number(row.net_revenue);
    const cor = Number(row.cost_of_revenue);
    const payroll = Number(row.payroll);
    const opex = Number(row.operating_expenses);
    const expected = net - cor - payroll - opex;
    expect(Number(row.operating_contribution)).toBeCloseTo(expected, 2);
    expect(net).toBeGreaterThanOrEqual(restB1ExternalNetMar + restB2ExternalNetMar);
    expect(Number(row.capex_actual)).toBeDefined();
  });

  it("handles zero-budget actual rows with null variance percentage", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, {
      fiscalPeriodId: fiscalPeriodMarId,
      organizationUnitId: REST_B1,
      payerId: PAYER_GOV,
      serviceLineId: SL_DINE,
    });
    expect(rows.length).toBe(1);
    expect(Number(rows[0].budgeted_revenue)).toBe(0);
    expect(rows[0].revenue_variance_percentage).toBeNull();
    expect(Number(rows[0].revenue_variance)).toBe(restB1ExternalNetMar);
  });

  it("handles null payer and null service-line dimensions", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, {
      fiscalPeriodId: fiscalPeriodMarId,
      organizationUnitId: REST_B2,
    });
    const nullDims = rows.find((r) => r.payer_id == null && r.service_line_id == null);
    expect(nullDims).toBeDefined();
    expect(Number(nullDims!.external_net_revenue)).toBe(restB2ExternalNetMar);
  });
});

describe.skipIf(!hasDb)("revenue workspace application path", () => {
  beforeAll(async () => {
    await resolveFiscalPeriodMarId();
  });

  it("loads workspace data for authenticated finance user via repository path", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const workspace = await loadBudgetVsActualWorkspaceData(db, ENTITY, FISCAL_YEAR_2027);
    expect(workspace.revenueRows.length).toBeGreaterThanOrEqual(2);
    expect(workspace.expenseRows.length).toBeGreaterThan(0);
    expect(workspace.profitabilityRows.length).toBeGreaterThan(0);
    expect(workspace.payers.length).toBeGreaterThanOrEqual(3);
    expect(workspace.serviceLines.length).toBeGreaterThanOrEqual(4);
    expect(workspace.fiscalPeriods.length).toBe(12);

    const marB1 = workspace.revenueRows.find(
      (r) =>
        r.fiscal_period_id === fiscalPeriodMarId &&
        r.organization_unit_id === REST_B1 &&
        r.payer_id === PAYER_GOV,
    );
    expect(marB1).toBeDefined();
    expect(Number(marB1!.external_net_revenue)).toBe(restB1ExternalNetMar);
  });

  it("applies payer and period filters through the same repository path as the workspace action", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const all = await loadBudgetVsActualWorkspaceData(db, ENTITY);
    const filtered = await getRevenueBudgetVsActual(db, ENTITY, {
      fiscalPeriodId: fiscalPeriodMarId,
      payerId: PAYER_GOV,
    });
    expect(filtered.length).toBeLessThan(all.revenueRows.length);
    expect(filtered.every((r) => r.payer_id === PAYER_GOV && r.fiscal_period_id === fiscalPeriodMarId)).toBe(true);
  });

  it("denies cross-tenant workspace revenue reads", async () => {
    const otherDb = await createAuthenticatedTestClient("otherFinance");
    const workspace = await loadBudgetVsActualWorkspaceData(otherDb, ENTITY);
    expect(workspace.revenueRows.length).toBe(0);
  });
});
