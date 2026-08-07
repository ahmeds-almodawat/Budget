import { describe, expect, it } from "vitest";
import { buildExecutiveAnalyticsModel } from "@/lib/analytics/executive-view-model";

const labels = {
  revenue: "Revenue",
  revenueVsBudget: "Revenue vs budget",
  grossProfit: "Gross profit",
  grossMargin: "Gross margin",
  operatingContribution: "Operating contribution",
  actualOperatingCost: "Actual operating cost",
  openCommitments: "Open commitments",
  capex: "CAPEX",
  capexSubtitle: "Separate",
  budget: "Budget",
  actual: "Actual",
  commitment: "Commitment",
  remaining: "Remaining",
  netRevenue: "Net revenue",
  grossProfitSeries: "Gross profit",
  operatingContributionSeries: "Operating contribution",
  costOfRevenue: "Cost of revenue",
  payroll: "Payroll",
  opex: "Operating expenses",
  gross: "Gross",
  rejections: "Rejections",
  discounts: "Discounts",
  refunds: "Refunds",
  creditNotes: "Credit notes",
  otherDeductions: "Other deductions",
  adjustments: "Adjustments",
  net: "Net",
  classification: {},
  exceptions: {
    delayedMilestones: "Delayed",
    matchExceptions: "Match exceptions",
    unmapped: "Unmapped",
    periodBlockers: "Blockers",
  },
  insights: {
    matchExceptions: "Match exceptions",
    delayedMilestones: "Delayed milestones",
  },
};

describe("executive analytics view model", () => {
  it("formats a profitability ratio as percentage points and preserves an authoritative zero", () => {
    const model = buildExecutiveAnalyticsModel({
      locale: "en",
      localePrefix: "/en",
      revenueRows: [
        {
          period_number: 1,
          budgeted_revenue: 100,
          actual_net_revenue: 100,
          gross_actual_revenue: 100,
          rejection_amount: 0,
          discount_amount: 0,
          refund_amount: 0,
          credit_note_amount: 0,
          other_deduction_amount: 0,
        } as never,
      ],
      expenseRows: [],
      profitabilityRows: [
        {
          period_number: 1,
          net_revenue: 0,
          cost_of_revenue: 0,
          gross_profit: 0,
          gross_margin_percentage: 0.4,
          payroll: 0,
          operating_expenses: 0,
          operating_contribution: 0,
          capex_actual: 0,
        } as never,
      ],
      openCommitments: 0,
      delayedMilestones: 0,
      matchExceptions: 0,
      unmappedActuals: 0,
      periodBlockers: 0,
      labels,
    });

    expect(model.kpis.find((kpi) => kpi.id === "gross-margin")?.formattedValue).toMatch(/40\.0%/);
    expect(model.profitabilityBridge[0]).toMatchObject({ id: "net", value: 0 });
  });
});
