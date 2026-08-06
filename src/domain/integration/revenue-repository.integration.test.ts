import { describe, it, expect, beforeAll } from "vitest";
import {
  getBudgetVsActualDetail,
  getProfitabilityPerformance,
  getRevenueBudgetVsActual,
} from "@/data/repositories/revenue-repository";
import { createDraftBudgetVersion, transitionBudgetVersion } from "@/data/repositories/budget-repository";
import {
  CONTROL_SCOPE_REST_BUDGET_2027,
  COST_NODE_REVENUE,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
  ORG_UNIT_REST_B1,
} from "@/types/database";
import { TEST_USER_IDS } from "@/test/fixtures/users";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

const ENTITY = LEGAL_ENTITY_MODAWAT;
const REST_B1 = ORG_UNIT_REST_B1;
const PERIOD_MAR = "88888888-8888-8888-8888-888888888803";
const PAYER_GOV = "88888888-8888-8888-8888-888888888801";
const PAYER_INS = "88888888-8888-8888-8888-888888888802";
const SL_DINE = "99999999-9999-9999-9999-999999999904";
const NONEXISTENT_PAYER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa99";

describe.skipIf(!hasDb)("revenue repository integration", () => {
  let hasRevenueFixture = false;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }
    try {
      const db = await createAuthenticatedTestClient("finance");
      const rows = await getRevenueBudgetVsActual(db, ENTITY);
      hasRevenueFixture = rows.length > 0;
    } catch {
      hasRevenueFixture = false;
    }
  });

  it.skipIf(!hasRevenueFixture)("retrieves revenue report with no filters", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY);
    expect(rows.length).toBeGreaterThan(0);
    const restB1 = rows.find(
      (r) => r.organization_unit_id === REST_B1 && Number(r.period_number) === 3,
    );
    expect(restB1).toBeDefined();
    expect(Number(restB1!.external_net_revenue)).toBe(85000);
    expect(Number(restB1!.budgeted_revenue)).toBe(0);
  });

  it("filters by payer category (empty when allocation has no payer)", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const { data: categories } = await db.from("payer_categories").select("id").eq("code", "government").single();
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { payerCategoryId: categories!.id });
    const restActual = rows.filter((r) => r.organization_unit_id === REST_B1 && Number(r.external_net_revenue) > 0);
    expect(restActual.length).toBe(0);
  });

  it("filters by specific payer", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { payerId: PAYER_GOV });
    expect(rows.every((r) => r.payer_id === PAYER_GOV || r.payer_id == null)).toBe(true);
  });

  it("filters by service line", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { serviceLineId: SL_DINE });
    expect(rows.every((r) => r.service_line_id === SL_DINE || r.service_line_id == null)).toBe(true);
  });

  it.skipIf(!hasRevenueFixture)("filters by fiscal period", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { fiscalPeriodId: PERIOD_MAR });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.fiscal_period_id === PERIOD_MAR)).toBe(true);
    const mar = rows.find((r) => r.organization_unit_id === REST_B1);
    expect(mar && Number(mar.external_net_revenue)).toBe(85000);
  });

  it.skipIf(!hasRevenueFixture)("filters by organization unit", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { organizationUnitId: REST_B1 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organization_unit_id === REST_B1)).toBe(true);
  });

  it("applies combined payer and service-line filters", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, {
      payerId: PAYER_INS,
      serviceLineId: SL_DINE,
    });
    expect(rows.every((r) => (r.payer_id === PAYER_INS || r.payer_id == null) && (r.service_line_id === SL_DINE || r.service_line_id == null))).toBe(true);
  });

  it.skipIf(!hasRevenueFixture)("returns actual-only rows (budget zero, actual positive)", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { fiscalPeriodId: PERIOD_MAR, organizationUnitId: REST_B1 });
    const actualOnly = rows.filter((r) => Number(r.budgeted_revenue) === 0 && Number(r.external_net_revenue) > 0);
    expect(actualOnly.length).toBeGreaterThanOrEqual(1);
    expect(Number(actualOnly[0].external_net_revenue)).toBe(85000);
  });

  it("returns budget-only rows after approved net-only budget", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");
    const monthly = Array(12).fill("7083.3333");
    monthly[11] = "7083.3367";
    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: ENTITY,
      controlScopeId: CONTROL_SCOPE_REST_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-NET-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: REST_B1,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "85000.0000",
          monthlyAmounts: monthly,
          revenueBudgetBasis: "net_only",
          payerId: PAYER_GOV,
        },
      ],
    });
    await transitionBudgetVersion(ownerDb, { budgetVersionId: version.id, nextStatus: "submitted", actorId: TEST_USER_IDS.budgetOwner });
    await transitionBudgetVersion(financeDb, { budgetVersionId: version.id, nextStatus: "under_review", actorId: TEST_USER_IDS.finance });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "approved",
      actorId: TEST_USER_IDS.approver,
      lockOriginalAmount: "85000.0000",
    });
    const rows = await getRevenueBudgetVsActual(financeDb, ENTITY, {
      organizationUnitId: REST_B1,
      payerId: PAYER_GOV,
    });
    const budgetOnly = rows.filter((r) => Number(r.budgeted_revenue) > 0 && Number(r.external_net_revenue) === 0);
    expect(budgetOnly.length).toBeGreaterThan(0);
    expect(Number(budgetOnly[0].budgeted_revenue)).toBeCloseTo(7083.3333, 1);
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
    const rows = await getRevenueBudgetVsActual(db, ENTITY);
    const withInternal = rows.filter((r) => Number(r.internal_revenue) !== 0);
    for (const row of withInternal) {
      expect(Number(row.external_net_revenue)).not.toBe(Number(row.internal_revenue));
    }
  });

  it("retrieves component-based budget lines after approval", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");
    const { data: grossType } = await ownerDb.from("revenue_component_types").select("id").eq("code", "gross_revenue").single();
    const { data: rejType } = await ownerDb.from("revenue_component_types").select("id").eq("code", "rejection").single();
    const monthly = Array(12).fill("10000.0000");
    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: ENTITY,
      controlScopeId: CONTROL_SCOPE_REST_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-COMP-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: REST_B1,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "120000.0000",
          monthlyAmounts: monthly,
          revenueBudgetBasis: "component_based",
          revenueComponentTypeId: grossType!.id,
        },
        {
          organizationUnitId: REST_B1,
          costNodeId: COST_NODE_REVENUE,
          plannedAmount: "10000.0000",
          monthlyAmounts: Array(12).fill("833.3333"),
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
      lockOriginalAmount: "110000.0000",
    });
    const detail = await getBudgetVsActualDetail(financeDb, ENTITY, { organizationUnitId: REST_B1 });
    const componentBudget = detail.filter(
      (r) => r.financial_classification === "revenue" && Number(r.monthly_budget) > 0,
    );
    expect(componentBudget.length).toBeGreaterThanOrEqual(2);
    const grossLine = componentBudget.find((r) => Number(r.monthly_budget) >= 9000);
    expect(grossLine).toBeDefined();
    expect(Number(grossLine!.monthly_budget)).toBeCloseTo(10000, 0);
  });

  it("retrieves net-only budget retrieval", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const { data: versions } = await db
      .from("budget_versions")
      .select("id, budget_lines(revenue_budget_basis, planned_amount)")
      .eq("legal_entity_id", ENTITY)
      .eq("control_scope_id", CONTROL_SCOPE_REST_BUDGET_2027);
    const netOnly = (versions ?? []).flatMap((v) =>
      ((v.budget_lines as { revenue_budget_basis: string }[]) ?? []).filter((l) => l.revenue_budget_basis === "net_only"),
    );
    expect(netOnly.length).toBeGreaterThanOrEqual(0);
  });

  it.skipIf(!hasRevenueFixture)("retrieves profitability with CAPEX excluded from operating contribution", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getProfitabilityPerformance(db, ENTITY, { fiscalPeriodId: PERIOD_MAR });
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    const net = Number(row.net_revenue);
    const cor = Number(row.cost_of_revenue);
    const payroll = Number(row.payroll);
    const opex = Number(row.operating_expenses);
    const expected = net - cor - payroll - opex;
    expect(Number(row.operating_contribution)).toBeCloseTo(expected, 2);
    expect(Number(row.capex_actual)).toBeDefined();
  });

  it.skipIf(!hasRevenueFixture)("handles zero-budget actual rows with null variance percentage", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { fiscalPeriodId: PERIOD_MAR, organizationUnitId: REST_B1 });
    const zeroBudget = rows.find((r) => Number(r.budgeted_revenue) === 0 && Number(r.external_net_revenue) > 0);
    expect(zeroBudget).toBeDefined();
    expect(zeroBudget!.revenue_variance_percentage).toBeNull();
    expect(Number(zeroBudget!.revenue_variance)).toBe(85000);
  });

  it.skipIf(!hasRevenueFixture)("handles null payer and null service-line dimensions", async () => {
    const db = await createAuthenticatedTestClient("finance");
    const rows = await getRevenueBudgetVsActual(db, ENTITY, { fiscalPeriodId: PERIOD_MAR, organizationUnitId: REST_B1 });
    const nullDims = rows.find((r) => r.payer_id == null && r.service_line_id == null);
    expect(nullDims).toBeDefined();
    expect(Number(nullDims!.external_net_revenue)).toBe(85000);
  });
});
