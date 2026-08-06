import { describe, it, expect } from "vitest";
import {
  calculateEarnedValue,
  calculateOpenCommitment,
  calculateEstimateAtCompletion,
  calculateAvailableBudget,
  calculateCurrentApprovedBudget,
  calculateDriverBudgetAmount,
  calculateVat,
  calculateAccountableDelay,
  calculateRiskExposure,
  isVarianceExplanationRequired,
  calculateProgressPercent,
  calculateRevenueVariance,
  calculateExpenseVariance,
  calculateVariancePercentage,
  classifyRevenueVarianceStatus,
  classifyExpenseVarianceStatus,
  calculateNetRevenue,
  calculateProfitability,
} from "@/domain/financial/calculations";

describe("financial calculations", () => {
  it("calculates earned value metrics", () => {
    const result = calculateEarnedValue({
      budgetAtCompletion: "100000",
      plannedValue: "50000",
      earnedValue: "40000",
      actualCost: "45000",
    });
    expect(result.costVariance.toFixed(2)).toBe("-5000.00");
    expect(result.scheduleVariance.toFixed(2)).toBe("-10000.00");
    expect(result.costPerformanceIndex?.toFixed(4)).toBe("0.8889");
    expect(result.schedulePerformanceIndex?.toFixed(4)).toBe("0.8000");
  });

  it("handles zero denominators safely", () => {
    const result = calculateEarnedValue({
      budgetAtCompletion: "100000",
      plannedValue: "0",
      earnedValue: "0",
      actualCost: "0",
    });
    expect(result.costPerformanceIndex).toBeNull();
    expect(result.schedulePerformanceIndex).toBeNull();
  });

  it("calculates open commitment", () => {
    expect(
      calculateOpenCommitment({
        totalCommitted: "100000",
        invoicedApplied: "60000",
        cancelled: "5000",
      }).toFixed(2),
    ).toBe("35000.00");
  });

  it("calculates EAC components", () => {
    expect(
      calculateEstimateAtCompletion({
        actualCost: "45000",
        openCommitments: "20000",
        forecastUncommitted: "10000",
      }).toFixed(2),
    ).toBe("75000.00");
  });

  it("calculates available budget", () => {
    expect(
      calculateAvailableBudget({
        currentApprovedBudget: "100000",
        actualCost: "45000",
        openCommitments: "20000",
      }).toFixed(2),
    ).toBe("35000.00");
  });

  it("calculates current approved budget", () => {
    expect(
      calculateCurrentApprovedBudget({
        originalApproved: "100000",
        increases: "15000",
        reductions: "5000",
      }).toFixed(2),
    ).toBe("110000.00");
  });

  it("calculates driver-based budget amount", () => {
    expect(
      calculateDriverBudgetAmount({ quantity: "1200", unitRate: "85.50" }).toFixed(2),
    ).toBe("102600.00");
  });

  it("calculates VAT", () => {
    const vat = calculateVat({ amountExcludingVat: "1000", vatRatePercent: "15" });
    expect(vat.vatAmount.toFixed(2)).toBe("150.00");
    expect(vat.amountIncludingVat.toFixed(2)).toBe("1150.00");
  });

  it("calculates accountable delay", () => {
    expect(
      calculateAccountableDelay({ grossDelayDays: 20, approvedNonControllableDays: 13 }),
    ).toBe(7);
  });

  it("calculates risk exposure", () => {
    expect(
      calculateRiskExposure({ probabilityPercent: "25", financialImpact: "400000" }).toFixed(2),
    ).toBe("100000.00");
  });

  it("detects variance explanation requirement", () => {
    expect(
      isVarianceExplanationRequired({
        varianceAmount: "30000",
        budgetAmount: "200000",
        thresholdAmount: "25000",
        thresholdPercent: "10",
      }),
    ).toBe(true);
  });

  it("calculates weighted step progress", () => {
    const progress = calculateProgressPercent("weighted_steps", {
      completedSteps: [
        { weight: 20, completed: true },
        { weight: 20, completed: true },
        { weight: 40, completed: false },
        { weight: 10, completed: false },
        { weight: 10, completed: false },
      ],
    });
    expect(progress).toBe(40);
  });

  it("revenue variance is favorable when actual exceeds budget", () => {
    expect(calculateRevenueVariance({ budgetNetRevenue: 100, actualNetRevenue: 110 }).toFixed(2)).toBe("10.00");
    expect(classifyRevenueVarianceStatus(100, 110)).toBe("favorable");
  });

  it("expense variance is favorable when actual is below budget", () => {
    expect(calculateExpenseVariance({ budgetCost: 100, actualCost: 90 }).toFixed(2)).toBe("10.00");
    expect(classifyExpenseVarianceStatus(100, 90)).toBe("favorable");
    expect(classifyExpenseVarianceStatus(100, 110)).toBe("unfavorable");
  });

  it("zero budget yields null variance percentage", () => {
    expect(calculateVariancePercentage({ varianceAmount: 10, budgetAmount: 0 })).toBeNull();
    expect(classifyRevenueVarianceStatus(0, 5)).toBe("unbudgeted");
  });

  it("calculates gross-to-net revenue", () => {
    expect(
      calculateNetRevenue({
        grossRevenue: 120,
        rejections: 10,
        discounts: 5,
      }).toFixed(2),
    ).toBe("105.00");
  });

  it("calculates profitability bridge", () => {
    const p = calculateProfitability({
      netRevenue: 1000,
      costOfRevenue: 400,
      payroll: 200,
      operatingExpenses: 100,
    });
    expect(p.grossProfit.toFixed(2)).toBe("600.00");
    expect(p.operatingContribution.toFixed(2)).toBe("300.00");
    expect(p.grossMarginPercentage?.toFixed(4)).toBe("0.6000");
  });
});
