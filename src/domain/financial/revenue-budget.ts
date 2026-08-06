import { money, sumMoney, type MoneyInput } from "@/lib/money";
import { calculateNetRevenue } from "@/domain/financial/calculations";

export type RevenueBudgetBasis = "net_only" | "component_based";

export const REVENUE_COMPONENT_CODES = [
  "gross_revenue",
  "rejection",
  "discount",
  "refund",
  "credit_note",
  "other_deduction",
  "other_adjustment",
] as const;

export type RevenueComponentCode = (typeof REVENUE_COMPONENT_CODES)[number];

export interface ComponentLineInput {
  componentCode: RevenueComponentCode;
  /** Positive magnitude for deductions; signed for other_adjustment */
  annualAmount: MoneyInput;
  monthlyAmounts: string[];
}

export interface NetOnlyLineInput {
  plannedQuantity?: MoneyInput;
  unitOfMeasure?: string;
  plannedUnitRate?: MoneyInput;
  plannedAmount: MoneyInput;
  monthlyAmounts: string[];
  assumption?: string;
  notes?: string;
}

export function calculateDriverAmount(
  quantity: MoneyInput | undefined,
  rate: MoneyInput | undefined,
): string | null {
  if (quantity == null || rate == null) return null;
  return money(quantity).times(money(rate)).toFixed(4);
}

export function validateMonthlyPhasing(annualAmount: MoneyInput, monthlyAmounts: string[], tolerance = "0.01") {
  if (monthlyAmounts.length !== 12) {
    throw new Error("Monthly phasing must contain exactly 12 periods.");
  }
  const total = sumMoney(monthlyAmounts);
  const annual = money(annualAmount);
  if (total.minus(annual).abs().gt(money(tolerance))) {
    throw new Error(
      `Monthly allocations (${total.toFixed(2)}) must equal annual amount (${annual.toFixed(2)}).`,
    );
  }
}

export function validateRevenueBasisConsistency(bases: (RevenueBudgetBasis | null | undefined)[]) {
  const distinct = new Set(bases.filter(Boolean));
  if (distinct.size > 1) {
    throw new Error("Net-only and component-based revenue budgets cannot be mixed in one version.");
  }
}

export function calculateComponentBasedNetPreview(components: ComponentLineInput[]) {
  const byCode = Object.fromEntries(
    REVENUE_COMPONENT_CODES.map((code) => [code, money(0)]),
  ) as Record<RevenueComponentCode, ReturnType<typeof money>>;

  for (const line of components) {
    const amount = money(line.annualAmount);
    if (line.componentCode === "other_adjustment") {
      byCode.other_adjustment = byCode.other_adjustment.plus(amount);
    } else if (line.componentCode === "gross_revenue") {
      byCode.gross_revenue = byCode.gross_revenue.plus(amount.abs());
    } else {
      byCode[line.componentCode] = byCode[line.componentCode].plus(amount.abs());
    }
  }

  const net = calculateNetRevenue({
    grossRevenue: byCode.gross_revenue,
    rejections: byCode.rejection,
    discounts: byCode.discount,
    refunds: byCode.refund,
    creditNotes: byCode.credit_note,
    otherDeductions: byCode.other_deduction,
    otherAdjustments: byCode.other_adjustment,
  });

  return {
    grossBudget: byCode.gross_revenue,
    rejectionBudget: byCode.rejection,
    discountBudget: byCode.discount,
    refundBudget: byCode.refund,
    creditNoteBudget: byCode.credit_note,
    otherDeductionBudget: byCode.other_deduction,
    otherAdjustmentBudget: byCode.other_adjustment,
    netRevenueBudget: net,
  };
}

export function calculateDerivedMonthlyNet(
  components: ComponentLineInput[],
  periodIndex: number,
): string {
  const slice = components.map((c) => ({
    componentCode: c.componentCode,
    annualAmount: c.monthlyAmounts[periodIndex] ?? "0",
    monthlyAmounts: [c.monthlyAmounts[periodIndex] ?? "0"],
  }));
  return calculateComponentBasedNetPreview(slice).netRevenueBudget.toFixed(4);
}

export function validateComponentMonthlyReconciliation(components: ComponentLineInput[]) {
  for (const line of components) {
    validateMonthlyPhasing(line.annualAmount, line.monthlyAmounts);
  }
  const annualNet = calculateComponentBasedNetPreview(components).netRevenueBudget;
  const monthlyNetTotal = sumMoney(
    Array.from({ length: 12 }, (_, i) => calculateDerivedMonthlyNet(components, i)),
  );
  if (monthlyNetTotal.minus(annualNet).abs().gt(money("0.01"))) {
    throw new Error(
      `Derived monthly net revenue (${monthlyNetTotal.toFixed(2)}) must equal annual net (${annualNet.toFixed(2)}).`,
    );
  }
}

export function validateComponentBasedLines(components: ComponentLineInput[]) {
  if (components.length === 0) {
    throw new Error("Component-based revenue budget requires at least one component line.");
  }
  const hasGross = components.some((c) => c.componentCode === "gross_revenue");
  if (!hasGross) {
    throw new Error("Component-based revenue budget requires a gross revenue component.");
  }
  validateComponentMonthlyReconciliation(components);
}

export function validateNetOnlyLine(input: NetOnlyLineInput) {
  validateMonthlyPhasing(input.plannedAmount, input.monthlyAmounts);
  const driver = calculateDriverAmount(input.plannedQuantity, input.plannedUnitRate);
  if (driver && money(driver).minus(money(input.plannedAmount)).abs().gt(money("0.01"))) {
    // Driver difference is informational only — do not overwrite manual amount
    return { driverAmount: driver, difference: money(input.plannedAmount).minus(money(driver)).toFixed(4) };
  }
  return { driverAmount: driver, difference: "0" };
}
