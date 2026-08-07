import { describe, it, expect } from "vitest";
import {
  lineTotal,
  remainingQty,
  evaluationWeightedScore,
  matchWithinTolerance,
  invoiceUnpaidBalance,
  contractRemainingCeiling,
} from "@/domain/procurement/calculations";

describe("procurement calculations", () => {
  it("calculates line total", () => {
    expect(lineTotal("10", "25.50").toFixed(2)).toBe("255.00");
    expect(lineTotal(3, 100).toFixed(4)).toBe("300.0000");
  });

  it("calculates remaining quantity", () => {
    expect(remainingQty("100", "40").toFixed(4)).toBe("60.0000");
    expect(remainingQty("10", "10").toFixed(4)).toBe("0.0000");
    expect(remainingQty("5", "8").toFixed(4)).toBe("0.0000");
  });

  it("calculates evaluation weighted score", () => {
    // (80/100)*40 + (90/100)*60 = 32 + 54 = 86
    expect(
      evaluationWeightedScore([
        { score: "80", scaleMax: "100", weightPercent: "40" },
        { score: "90", scaleMax: "100", weightPercent: "60" },
      ]).toFixed(4),
    ).toBe("86.0000");
  });

  it("skips zero scale in weighted score", () => {
    expect(
      evaluationWeightedScore([
        { score: "50", scaleMax: "0", weightPercent: "100" },
      ]).toFixed(4),
    ).toBe("0.0000");
  });

  it("checks match within tolerance", () => {
    expect(matchWithinTolerance("1000", "1000", "0")).toBe(true);
    expect(matchWithinTolerance("1005", "1000", "10")).toBe(true);
    expect(matchWithinTolerance("1011", "1000", "10")).toBe(false);
    expect(matchWithinTolerance("990", "1000", "5")).toBe(false);
  });

  it("calculates invoice unpaid balance", () => {
    expect(invoiceUnpaidBalance("10000", ["3000", "2000"]).toFixed(2)).toBe("5000.00");
    expect(invoiceUnpaidBalance("1000", ["1000"]).toFixed(2)).toBe("0.00");
    expect(invoiceUnpaidBalance("500", ["600"]).toFixed(2)).toBe("0.00");
  });

  it("calculates contract remaining ceiling", () => {
    expect(contractRemainingCeiling("500000", "125000").toFixed(2)).toBe("375000.00");
    expect(contractRemainingCeiling("100", "100").toFixed(2)).toBe("0.00");
    expect(contractRemainingCeiling("50", "75").toFixed(2)).toBe("0.00");
  });
});
