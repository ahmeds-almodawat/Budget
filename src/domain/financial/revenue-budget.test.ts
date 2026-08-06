import { describe, it, expect } from "vitest";
import {
  calculateComponentBasedNetPreview,
  calculateDerivedMonthlyNet,
  validateComponentBasedLines,
  validateMonthlyPhasing,
  validateNetOnlyLine,
  validateRevenueBasisConsistency,
} from "@/domain/financial/revenue-budget";

describe("revenue budget domain", () => {
  const monthly100 = Array(12).fill("100");
  const monthly10 = Array(12).fill("10");
  const monthlyMonthly950 = Array(11).fill("79.1667").concat(["79.1663"]);

  it("validates net-only monthly reconciliation", () => {
    expect(() => validateMonthlyPhasing("1200", monthly100)).not.toThrow();
    expect(() => validateMonthlyPhasing("1200", Array(12).fill("50"))).toThrow();
  });

  it("rejects mixed budgeting bases", () => {
    expect(() => validateRevenueBasisConsistency(["net_only", "component_based"])).toThrow();
    expect(() => validateRevenueBasisConsistency(["net_only", "net_only"])).not.toThrow();
  });

  it("calculates component-based gross-to-net preview", () => {
    const preview = calculateComponentBasedNetPreview([
      { componentCode: "gross_revenue", annualAmount: 120, monthlyAmounts: monthly10 },
      { componentCode: "rejection", annualAmount: 10, monthlyAmounts: monthly10 },
      { componentCode: "discount", annualAmount: 5, monthlyAmounts: monthly10 },
    ]);
    expect(preview.netRevenueBudget.toFixed(2)).toBe("105.00");
  });

  it("handles other-adjustment positive and negative effects", () => {
    const positive = calculateComponentBasedNetPreview([
      { componentCode: "gross_revenue", annualAmount: 100, monthlyAmounts: monthly10 },
      { componentCode: "other_adjustment", annualAmount: 5, monthlyAmounts: monthly10 },
    ]);
    expect(positive.netRevenueBudget.toFixed(2)).toBe("105.00");

    const negative = calculateComponentBasedNetPreview([
      { componentCode: "gross_revenue", annualAmount: 100, monthlyAmounts: monthly10 },
      { componentCode: "other_adjustment", annualAmount: -3, monthlyAmounts: monthly10 },
    ]);
    expect(negative.netRevenueBudget.toFixed(2)).toBe("97.00");
  });

  it("validates component monthly reconciliation", () => {
    const components = [
      { componentCode: "gross_revenue" as const, annualAmount: "1200", monthlyAmounts: monthly100 },
      { componentCode: "rejection" as const, annualAmount: "120", monthlyAmounts: monthly10 },
    ];
    expect(() => validateComponentBasedLines(components)).not.toThrow();
  });

  it("derives monthly net revenue per period", () => {
    const components = [
      { componentCode: "gross_revenue" as const, annualAmount: "1200", monthlyAmounts: monthly100 },
      { componentCode: "rejection" as const, annualAmount: "120", monthlyAmounts: monthly10 },
    ];
    expect(calculateDerivedMonthlyNet(components, 0)).toBe("90.0000");
  });

  it("preserves manually entered net-only amount when driver differs", () => {
    const result = validateNetOnlyLine({
      plannedQuantity: "100",
      plannedUnitRate: "10",
      plannedAmount: "950",
      monthlyAmounts: monthlyMonthly950,
    });
    expect(result.driverAmount).toBe("1000.0000");
    expect(result.difference).toBe("-50.0000");
  });
});
