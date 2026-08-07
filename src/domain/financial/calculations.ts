import { Decimal, money, safeDivide, sumMoney, type MoneyInput } from "@/lib/money";

export interface EarnedValueInput {
  budgetAtCompletion: MoneyInput;
  plannedValue: MoneyInput;
  earnedValue: MoneyInput;
  actualCost: MoneyInput;
}

export interface EarnedValueResult {
  budgetAtCompletion: Decimal;
  plannedValue: Decimal;
  earnedValue: Decimal;
  actualCost: Decimal;
  costVariance: Decimal;
  scheduleVariance: Decimal;
  costPerformanceIndex: Decimal | null;
  schedulePerformanceIndex: Decimal | null;
  estimateAtCompletion: Decimal | null;
  estimateToComplete: Decimal | null;
  varianceAtCompletion: Decimal | null;
}

export function calculateEarnedValue(input: EarnedValueInput): EarnedValueResult {
  const bac = money(input.budgetAtCompletion);
  const pv = money(input.plannedValue);
  const ev = money(input.earnedValue);
  const ac = money(input.actualCost);

  const cv = ev.minus(ac);
  const sv = ev.minus(pv);
  const cpi = safeDivide(ev, ac);
  const spi = safeDivide(ev, pv);

  let eac: Decimal | null = null;
  if (cpi && !cpi.isZero()) {
    eac = bac.div(cpi);
  }

  const etc = eac ? eac.minus(ac) : null;
  const vac = eac ? bac.minus(eac) : null;

  return {
    budgetAtCompletion: bac,
    plannedValue: pv,
    earnedValue: ev,
    actualCost: ac,
    costVariance: cv,
    scheduleVariance: sv,
    costPerformanceIndex: cpi,
    schedulePerformanceIndex: spi,
    estimateAtCompletion: eac,
    estimateToComplete: etc,
    varianceAtCompletion: vac,
  };
}

export interface CommitmentInput {
  totalCommitted: MoneyInput;
  invoicedApplied: MoneyInput;
  cancelled: MoneyInput;
}

export function calculateOpenCommitment(input: CommitmentInput): Decimal {
  return money(input.totalCommitted)
    .minus(money(input.invoicedApplied))
    .minus(money(input.cancelled));
}

export interface EacInput {
  actualCost: MoneyInput;
  openCommitments: MoneyInput;
  forecastUncommitted: MoneyInput;
}

export function calculateEstimateAtCompletion(input: EacInput): Decimal {
  return sumMoney([
    input.actualCost,
    input.openCommitments,
    input.forecastUncommitted,
  ]);
}

export interface AvailableBudgetInput {
  currentApprovedBudget: MoneyInput;
  actualCost: MoneyInput;
  openCommitments: MoneyInput;
}

export function calculateAvailableBudget(input: AvailableBudgetInput): Decimal {
  return money(input.currentApprovedBudget)
    .minus(money(input.actualCost))
    .minus(money(input.openCommitments));
}

export interface CurrentApprovedBudgetInput {
  originalApproved: MoneyInput;
  increases: MoneyInput;
  reductions: MoneyInput;
}

export function calculateCurrentApprovedBudget(
  input: CurrentApprovedBudgetInput,
): Decimal {
  return money(input.originalApproved)
    .plus(money(input.increases))
    .minus(money(input.reductions));
}

export interface DriverBudgetInput {
  quantity: MoneyInput;
  unitRate: MoneyInput;
}

export function calculateDriverBudgetAmount(input: DriverBudgetInput): Decimal {
  return money(input.quantity).times(money(input.unitRate));
}

export interface VatInput {
  amountExcludingVat: MoneyInput;
  vatRatePercent: MoneyInput;
}

export function calculateVat(input: VatInput): {
  amountExcludingVat: Decimal;
  vatAmount: Decimal;
  amountIncludingVat: Decimal;
} {
  const exVat = money(input.amountExcludingVat);
  const vat = exVat.times(money(input.vatRatePercent).div(100));
  return {
    amountExcludingVat: exVat,
    vatAmount: vat,
    amountIncludingVat: exVat.plus(vat),
  };
}

export interface AccountableDelayInput {
  grossDelayDays: number;
  approvedNonControllableDays: number;
}

export function calculateAccountableDelay(input: AccountableDelayInput): number {
  return Math.max(
    0,
    input.grossDelayDays - input.approvedNonControllableDays,
  );
}

export interface RiskExposureInput {
  probabilityPercent: MoneyInput;
  financialImpact: MoneyInput;
}

export function calculateRiskExposure(input: RiskExposureInput): Decimal {
  return money(input.financialImpact).times(money(input.probabilityPercent).div(100));
}

export interface VarianceExplanationRequiredInput {
  varianceAmount: MoneyInput;
  budgetAmount: MoneyInput;
  thresholdAmount: MoneyInput;
  thresholdPercent: MoneyInput;
}

export function isVarianceExplanationRequired(
  input: VarianceExplanationRequiredInput,
): boolean {
  const variance = money(input.varianceAmount).abs();
  const thresholdAmount = money(input.thresholdAmount);
  if (variance.gte(thresholdAmount)) return true;

  const budget = money(input.budgetAmount);
  if (budget.isZero()) return variance.gt(0);

  const percent = variance.div(budget).times(100);
  return percent.gte(money(input.thresholdPercent));
}

export interface RevenueVarianceInput {
  budgetNetRevenue: MoneyInput;
  actualNetRevenue: MoneyInput;
}

export function calculateRevenueVariance(input: RevenueVarianceInput): Decimal {
  return money(input.actualNetRevenue).minus(money(input.budgetNetRevenue));
}

export interface ExpenseVarianceInput {
  budgetCost: MoneyInput;
  actualCost: MoneyInput;
}

export function calculateExpenseVariance(input: ExpenseVarianceInput): Decimal {
  return money(input.budgetCost).minus(money(input.actualCost));
}

export interface VariancePercentageInput {
  varianceAmount: MoneyInput;
  budgetAmount: MoneyInput;
}

export function calculateVariancePercentage(input: VariancePercentageInput): Decimal | null {
  const budget = money(input.budgetAmount);
  if (budget.isZero()) return null;
  return money(input.varianceAmount).div(budget);
}

export type VarianceStatus = "favorable" | "unfavorable" | "on_target" | "unbudgeted";

export function classifyRevenueVarianceStatus(
  budget: MoneyInput,
  actual: MoneyInput,
): VarianceStatus {
  const b = money(budget);
  const a = money(actual);
  if (b.isZero() && !a.isZero()) return "unbudgeted";
  if (b.isZero() && a.isZero()) return "on_target";
  if (a.gt(b)) return "favorable";
  if (a.lt(b)) return "unfavorable";
  return "on_target";
}

export function classifyExpenseVarianceStatus(
  budget: MoneyInput,
  actual: MoneyInput,
): VarianceStatus {
  const b = money(budget);
  const a = money(actual);
  if (b.isZero() && !a.isZero()) return "unbudgeted";
  if (b.isZero() && a.isZero()) return "on_target";
  if (a.lt(b)) return "favorable";
  if (a.gt(b)) return "unfavorable";
  return "on_target";
}

export interface GrossToNetInput {
  grossRevenue: MoneyInput;
  rejections?: MoneyInput;
  discounts?: MoneyInput;
  refunds?: MoneyInput;
  creditNotes?: MoneyInput;
  otherDeductions?: MoneyInput;
  otherAdjustments?: MoneyInput;
}

export function calculateNetRevenue(input: GrossToNetInput): Decimal {
  return money(input.grossRevenue)
    .minus(money(input.rejections ?? 0))
    .minus(money(input.discounts ?? 0))
    .minus(money(input.refunds ?? 0))
    .minus(money(input.creditNotes ?? 0))
    .minus(money(input.otherDeductions ?? 0))
    .plus(money(input.otherAdjustments ?? 0));
}

export interface ProfitabilityInput {
  netRevenue: MoneyInput;
  costOfRevenue: MoneyInput;
  payroll: MoneyInput;
  operatingExpenses: MoneyInput;
}

export function calculateProfitability(input: ProfitabilityInput): {
  grossProfit: Decimal;
  grossMarginPercentage: Decimal | null;
  operatingContribution: Decimal;
  operatingContributionMargin: Decimal | null;
} {
  const net = money(input.netRevenue);
  const cor = money(input.costOfRevenue);
  const payroll = money(input.payroll);
  const opex = money(input.operatingExpenses);
  const grossProfit = net.minus(cor);
  const operatingContribution = grossProfit.minus(payroll).minus(opex);
  return {
    grossProfit,
    grossMarginPercentage: net.isZero() ? null : grossProfit.div(net),
    operatingContribution,
    operatingContributionMargin: net.isZero() ? null : operatingContribution.div(net),
  };
}

export type ProgressMethod =
  | "0/100"
  | "50/50"
  | "weighted_steps"
  | "quantity_completed"
  | "milestone_weighted"
  | "manual_verified";

export function calculateProgressPercent(
  method: ProgressMethod,
  params: {
    reportedPercent?: number;
    approvedPercent?: number;
    completedSteps?: { weight: number; completed: boolean }[];
    quantityCompleted?: MoneyInput;
    quantityTotal?: MoneyInput;
  },
): number {
  switch (method) {
    case "0/100":
      return params.approvedPercent ?? 0;
    case "50/50":
      return params.reportedPercent && params.reportedPercent > 0 ? 50 : 0;
    case "weighted_steps": {
      const steps = params.completedSteps ?? [];
      const totalWeight = steps.reduce((s, step) => s + step.weight, 0);
      if (totalWeight === 0) return 0;
      const earned = steps
        .filter((s) => s.completed)
        .reduce((s, step) => s + step.weight, 0);
      return (earned / totalWeight) * 100;
    }
    case "quantity_completed": {
      const total = money(params.quantityTotal ?? 0);
      if (total.isZero()) return 0;
      return money(params.quantityCompleted ?? 0).div(total).times(100).toNumber();
    }
    case "milestone_weighted":
    case "manual_verified":
      return params.approvedPercent ?? 0;
    default:
      return 0;
  }
}
