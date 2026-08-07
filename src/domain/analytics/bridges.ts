import { money, type MoneyInput } from "@/lib/money";
import type { WaterfallStep } from "@/domain/analytics/types";
import { toNumber } from "@/domain/analytics/format";

/** Presentation-only gross-to-net bridge from authoritative component amounts. */
export function buildGrossToNetBridge(input: {
  grossRevenue: MoneyInput;
  rejections?: MoneyInput;
  discounts?: MoneyInput;
  refunds?: MoneyInput;
  creditNotes?: MoneyInput;
  otherDeductions?: MoneyInput;
  adjustments?: MoneyInput;
  netRevenue: MoneyInput;
  labels: {
    gross: string;
    rejections: string;
    discounts: string;
    refunds: string;
    creditNotes: string;
    otherDeductions: string;
    adjustments: string;
    net: string;
  };
}): WaterfallStep[] {
  const steps: WaterfallStep[] = [
    { id: "gross", label: input.labels.gross, value: toNumber(input.grossRevenue), kind: "total" },
  ];
  const deductions: Array<[keyof typeof input.labels, MoneyInput | undefined]> = [
    ["rejections", input.rejections],
    ["discounts", input.discounts],
    ["refunds", input.refunds],
    ["creditNotes", input.creditNotes],
    ["otherDeductions", input.otherDeductions],
  ];
  for (const [key, amount] of deductions) {
    const n = toNumber(amount ?? 0);
    if (n === 0) continue;
    steps.push({
      id: key,
      label: input.labels[key],
      value: -Math.abs(n),
      kind: "decrease",
    });
  }
  const adj = toNumber(input.adjustments ?? 0);
  if (adj !== 0) {
    steps.push({
      id: "adjustments",
      label: input.labels.adjustments,
      value: adj,
      kind: adj >= 0 ? "increase" : "decrease",
    });
  }
  steps.push({ id: "net", label: input.labels.net, value: toNumber(input.netRevenue), kind: "total" });
  return steps;
}

/** Presentation-only profitability bridge. CAPEX is intentionally excluded. */
export function buildProfitabilityBridge(input: {
  netRevenue: MoneyInput;
  costOfRevenue: MoneyInput;
  grossProfit: MoneyInput;
  payroll: MoneyInput;
  operatingExpenses: MoneyInput;
  operatingContribution: MoneyInput;
  labels: {
    netRevenue: string;
    costOfRevenue: string;
    grossProfit: string;
    payroll: string;
    operatingExpenses: string;
    operatingContribution: string;
  };
}): WaterfallStep[] {
  return [
    { id: "net", label: input.labels.netRevenue, value: toNumber(input.netRevenue), kind: "total" },
    {
      id: "cor",
      label: input.labels.costOfRevenue,
      value: -Math.abs(toNumber(input.costOfRevenue)),
      kind: "decrease",
    },
    { id: "gp", label: input.labels.grossProfit, value: toNumber(input.grossProfit), kind: "total" },
    {
      id: "payroll",
      label: input.labels.payroll,
      value: -Math.abs(toNumber(input.payroll)),
      kind: "decrease",
    },
    {
      id: "opex",
      label: input.labels.operatingExpenses,
      value: -Math.abs(toNumber(input.operatingExpenses)),
      kind: "decrease",
    },
    {
      id: "oc",
      label: input.labels.operatingContribution,
      value: toNumber(input.operatingContribution),
      kind: "total",
    },
  ];
}

export function waterfallDisplayBars(steps: WaterfallStep[]): Array<{
  id: string;
  label: string;
  start: number;
  end: number;
  value: number;
  kind: WaterfallStep["kind"];
}> {
  let running = 0;
  return steps.map((step) => {
    if (step.kind === "total") {
      const start = 0;
      const end = step.value;
      running = step.value;
      return { id: step.id, label: step.label, start, end, value: step.value, kind: step.kind };
    }
    const start = running;
    running = money(running).plus(step.value).toNumber();
    return { id: step.id, label: step.label, start, end: running, value: step.value, kind: step.kind };
  });
}
