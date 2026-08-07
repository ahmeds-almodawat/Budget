import { Decimal, money, type MoneyInput } from "@/lib/money";
import type { VarianceStatus } from "@/domain/financial/calculations";

export function formatCompactMoney(
  value: MoneyInput,
  options: { currency?: string; locale?: string; arabicCurrency?: boolean } = {},
): string {
  const currency = options.currency ?? "SAR";
  const locale = options.locale ?? "en-SA";
  const abs = money(value).abs();
  const sign = money(value).isNegative() ? "-" : "";
  const currencyLabel = options.arabicCurrency ? "ر.س" : currency;

  let scaled: Decimal;
  let suffix = "";
  if (abs.gte(1_000_000_000)) {
    scaled = abs.div(1_000_000_000);
    suffix = "B";
  } else if (abs.gte(1_000_000)) {
    scaled = abs.div(1_000_000);
    suffix = "M";
  } else if (abs.gte(1_000)) {
    scaled = abs.div(1_000);
    suffix = "K";
  } else {
    scaled = abs;
  }

  const digits = suffix ? (scaled.gte(100) ? 0 : scaled.gte(10) ? 1 : 1) : 2;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: suffix ? Math.min(digits, 1) : 2,
    maximumFractionDigits: suffix ? Math.min(digits, 1) : 2,
  }).format(scaled.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber());

  return `${sign}${currencyLabel} ${formatted}${suffix}`;
}

export function formatExactMoney(
  value: MoneyInput,
  options: { currency?: string; locale?: string } = {},
): string {
  const currency = options.currency ?? "SAR";
  const locale = options.locale ?? "en-SA";
  const num = money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatCompactPercent(
  value: MoneyInput | null | undefined,
  locale = "en",
): string {
  if (value == null) return "—";
  const num = money(value).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(num / 100);
}

export function formatRatio(value: MoneyInput | null | undefined, locale = "en"): string {
  if (value == null) return "—";
  const num = money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)}x`;
}

export function formatInteger(value: number, locale = "en"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function varianceTone(status: VarianceStatus | undefined): "favorable" | "unfavorable" | "neutral" {
  if (status === "favorable") return "favorable";
  if (status === "unfavorable" || status === "unbudgeted") return "unfavorable";
  return "neutral";
}

export function toNumber(value: MoneyInput | null | undefined): number {
  if (value == null) return 0;
  return money(value).toNumber();
}
