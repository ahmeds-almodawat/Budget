import { describe, expect, it } from "vitest";
import {
  formatCompactMoney,
  formatCompactPercent,
  formatRatio,
  varianceTone,
} from "@/domain/analytics/format";
import { buildGrossToNetBridge, buildProfitabilityBridge, waterfallDisplayBars } from "@/domain/analytics/bridges";
import {
  expenseTrendSeries,
  revenueTrendSeries,
  sparklineFromSeries,
  topVariances,
  utilizationByClassification,
} from "@/domain/analytics/series";
import {
  approvalAgeBuckets,
  buildGanttRange,
  buildProcurementPipeline,
  dateInTimeZone,
  daysBetween,
  ganttBarOffset,
  periodCloseProgress,
  sortTimelineEvents,
} from "@/domain/analytics/timeline";
import { invoiceMatchStatusKey } from "@/domain/analytics/status";

describe("analytics format", () => {
  it("maps invoice match identifiers to localized message keys", () => {
    expect(invoiceMatchStatusKey("matched")).toBe("matched");
    expect(invoiceMatchStatusKey("matched_within_tolerance")).toBe("matchedWithinTolerance");
    expect(invoiceMatchStatusKey("exception")).toBe("exception");
    expect(invoiceMatchStatusKey("overridden")).toBe("overridden");
    expect(invoiceMatchStatusKey("future_status")).toBe("unknown");
  });

  it("formats compact money", () => {
    expect(formatCompactMoney(4_700_000)).toContain("4.7");
    expect(formatCompactMoney(4_700_000)).toContain("M");
    expect(formatCompactMoney(122_700_000, { arabicCurrency: true })).toContain("ر.س");
  });

  it("formats percent and ratio", () => {
    expect(formatCompactPercent(12.4)).toMatch(/12\.4%/);
    expect(formatRatio(2.2)).toBe("2.20x");
  });

  it("maps variance tone without assuming positive is good", () => {
    expect(varianceTone("favorable")).toBe("favorable");
    expect(varianceTone("unfavorable")).toBe("unfavorable");
    expect(varianceTone("on_target")).toBe("neutral");
  });
});

describe("bridges", () => {
  it("builds gross-to-net bridge from authoritative components", () => {
    const steps = buildGrossToNetBridge({
      grossRevenue: 1000,
      rejections: 50,
      discounts: 20,
      netRevenue: 930,
      labels: {
        gross: "Gross",
        rejections: "Rejections",
        discounts: "Discounts",
        refunds: "Refunds",
        creditNotes: "Credits",
        otherDeductions: "Other",
        adjustments: "Adj",
        net: "Net",
      },
    });
    expect(steps[0].value).toBe(1000);
    expect(steps.at(-1)?.value).toBe(930);
    expect(steps.some((s) => s.id === "rejections" && s.value === -50)).toBe(true);
  });

  it("keeps CAPEX out of profitability bridge", () => {
    const steps = buildProfitabilityBridge({
      netRevenue: 100,
      costOfRevenue: 40,
      grossProfit: 60,
      payroll: 20,
      operatingExpenses: 10,
      operatingContribution: 30,
      labels: {
        netRevenue: "Net",
        costOfRevenue: "COR",
        grossProfit: "GP",
        payroll: "Payroll",
        operatingExpenses: "Opex",
        operatingContribution: "OC",
      },
    });
    expect(steps.map((s) => s.id)).not.toContain("capex");
    const bars = waterfallDisplayBars(steps);
    expect(bars.at(-1)?.end).toBe(30);
  });
});

describe("series converters", () => {
  it("aggregates revenue trend by period", () => {
    const points = revenueTrendSeries([
      { period_number: 2, budgeted_revenue: 100, actual_net_revenue: 90 },
      { period_number: 1, budgeted_revenue: 80, actual_net_revenue: 85 },
      { period_number: 2, budgeted_revenue: 20, actual_net_revenue: 10 },
    ]);
    expect(points[0].key).toBe("1");
    expect(points[1].budget).toBe(120);
    expect(points[1].actual).toBe(100);
  });

  it("builds utilization and variance lists without inventing values", () => {
    const util = utilizationByClassification(
      [
        {
          financial_reporting_group: "payroll",
          monthly_budget: 100,
          mtd_actual: 40,
          commitment_open_current: 10,
        },
      ],
      { payroll: "Payroll" },
    );
    expect(util[0].remaining).toBe(50);

    const top = topVariances(
      [
        { id: "1", label: "A", budget: 100, actual: 120, kind: "revenue" },
        { id: "2", label: "B", budget: 100, actual: 80, kind: "expense" },
      ],
      "favorable",
    );
    expect(top.map((t) => t.id).sort()).toEqual(["1", "2"]);
  });

  it("does not invent sparkline from a single point", () => {
    expect(sparklineFromSeries([{ key: "1", label: "P1", actual: 10 }], "actual")).toEqual([10]);
    expect(expenseTrendSeries([]).length).toBe(0);
  });
});

describe("timeline helpers", () => {
  it("orders timeline events and computes gantt geometry", () => {
    const ordered = sortTimelineEvents([
      { id: "b", label: "B", at: "2027-03-01" },
      { id: "a", label: "A", at: "2027-01-01" },
      { id: "c", label: "C", at: null },
    ]);
    expect(ordered.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(daysBetween("2027-01-01", "2027-01-11")).toBe(10);
    const range = buildGanttRange([
      {
        id: "1",
        parentId: null,
        label: "P",
        kind: "phase",
        baselineStart: "2027-01-01",
        baselineEnd: "2027-06-30",
        forecastStart: "2027-01-15",
        forecastEnd: "2027-07-15",
        progressPercent: 40,
        delayed: false,
        completed: false,
      },
    ]);
    expect(range.start).toBe("2027-01-01");
    const bar = ganttBarOffset(range.start!, range.end!, "2027-01-01", "2027-02-01");
    expect(bar?.leftPct).toBe(0);
    expect(bar!.widthPct).toBeGreaterThan(0);
  });

  it("builds procurement pipeline and period-close progress presentation", () => {
    const pipeline = buildProcurementPipeline(
      [
        { stage: "rfq", amount: 100 },
        { stage: "rfq", amount: 50 },
        { stage: "po", amount: 200, count: 2 },
      ],
      ["requisition", "rfq", "po"],
      { requisition: "Req", rfq: "RFQ", po: "PO" },
    );
    expect(pipeline.find((p) => p.id === "rfq")?.count).toBe(2);
    expect(pipeline.find((p) => p.id === "rfq")?.amount).toBe(150);

    const unknownAmount = buildProcurementPipeline(
      [{ stage: "rfq", amount: null }, { stage: "rfq", amount: 50 }],
      ["rfq"],
      { rfq: "RFQ" },
    );
    expect(unknownAmount[0].amount).toBeNull();

    const progress = periodCloseProgress({
      automaticPassed: 2,
      automaticTotal: 4,
      manualPassed: 1,
      manualTotal: 1,
      blockingFailures: 1,
    });
    expect(progress.readinessPercent).toBe(60);
    expect(progress.blocked).toBe(true);
  });

  it("uses the configured business timezone for calendar dates", () => {
    expect(dateInTimeZone(new Date("2027-01-01T21:30:00Z"), "Asia/Riyadh")).toBe("2027-01-02");
  });

  it("buckets approval ages from timestamps", () => {
    const now = new Date("2027-06-15T00:00:00Z");
    const buckets = approvalAgeBuckets(
      [
        { createdAt: "2027-06-14T00:00:00Z" },
        { createdAt: "2027-06-10T00:00:00Z" },
        { createdAt: "2027-06-01T00:00:00Z" },
      ],
      now,
    );
    expect(buckets.find((b) => b.id === "0-2")?.count).toBe(1);
    expect(buckets.find((b) => b.id === "3-5")?.count).toBe(1);
    expect(buckets.find((b) => b.id === "10+")?.count).toBe(1);
  });
});
