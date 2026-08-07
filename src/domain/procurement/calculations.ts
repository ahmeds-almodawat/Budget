import { Decimal, money, type MoneyInput } from "@/lib/money";

/** Line total = quantity × unit price. */
export function lineTotal(quantity: MoneyInput, unitPrice: MoneyInput): Decimal {
  return money(quantity).times(money(unitPrice));
}

/** Remaining quantity after awards (never negative). */
export function remainingQty(orderedQty: MoneyInput, awardedQty: MoneyInput): Decimal {
  const remaining = money(orderedQty).minus(money(awardedQty));
  return remaining.isNegative() ? money(0) : remaining;
}

export interface EvaluationScoreInput {
  score: MoneyInput;
  scaleMax: MoneyInput;
  weightPercent: MoneyInput;
}

/**
 * Weighted evaluation score: Σ ((score / scaleMax) × weightPercent).
 * Matches sourcing evaluation RPC formula.
 */
export function evaluationWeightedScore(scores: EvaluationScoreInput[]): Decimal {
  return scores.reduce((acc, item) => {
    const scale = money(item.scaleMax);
    if (scale.isZero()) return acc;
    const contribution = money(item.score).div(scale).times(money(item.weightPercent));
    return acc.plus(contribution);
  }, money(0));
}

/** Absolute variance within a flat amount tolerance. */
export function matchWithinTolerance(
  actual: MoneyInput,
  expected: MoneyInput,
  toleranceAmount: MoneyInput,
): boolean {
  const variance = money(actual).minus(money(expected)).abs();
  return variance.lte(money(toleranceAmount));
}

/** Invoice unpaid balance = gross − sum of active payment request amounts. */
export function invoiceUnpaidBalance(
  grossAmount: MoneyInput,
  requestedAmounts: MoneyInput[],
): Decimal {
  const requested = requestedAmounts.reduce<Decimal>((acc, a) => acc.plus(money(a)), money(0));
  const balance = money(grossAmount).minus(requested);
  return balance.isNegative() ? money(0) : balance;
}

/** Contract remaining ceiling = ceiling − consumed (never negative). */
export function contractRemainingCeiling(
  ceilingValue: MoneyInput,
  consumedValue: MoneyInput,
): Decimal {
  const remaining = money(ceilingValue).minus(money(consumedValue));
  return remaining.isNegative() ? money(0) : remaining;
}
