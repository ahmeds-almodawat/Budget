import Decimal from "decimal.js";

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

export type MoneyInput = string | number | Decimal;

export function money(value: MoneyInput): Decimal {
  return new Decimal(value ?? 0);
}

export function formatMoney(
  value: MoneyInput,
  currency = "SAR",
  locale = "en-SA",
): string {
  const num = money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatPercent(value: MoneyInput, locale = "en"): string {
  const num = money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num / 100);
}

export function safeDivide(
  numerator: MoneyInput,
  denominator: MoneyInput,
): Decimal | null {
  const d = money(denominator);
  if (d.isZero()) return null;
  return money(numerator).div(d);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0));
}

export function allocateByPercent(
  total: MoneyInput,
  percentages: MoneyInput[],
): Decimal[] {
  const totalDec = money(total);
  const allocated = percentages.map((p) =>
    totalDec.times(money(p).div(100)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP),
  );
  const diff = totalDec.minus(sumMoney(allocated));
  if (!diff.isZero() && allocated.length > 0) {
    allocated[allocated.length - 1] = allocated[allocated.length - 1].plus(diff);
  }
  return allocated;
}

export function reconcileAllocations(
  sourceAmount: MoneyInput,
  allocationAmounts: MoneyInput[],
): { valid: boolean; total: Decimal; difference: Decimal } {
  const total = sumMoney(allocationAmounts);
  const source = money(sourceAmount);
  const difference = source.minus(total);
  return {
    valid: difference.abs().lte(money("0.0001")),
    total,
    difference,
  };
}
