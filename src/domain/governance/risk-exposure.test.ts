import { describe, it, expect } from "vitest";
import { calculateRiskExposure } from "@/domain/financial/calculations";

describe("risk exposure domain formula", () => {
  it("computes exposure as probability times financial impact", () => {
    expect(
      calculateRiskExposure({ probabilityPercent: "30", financialImpact: "500000" }).toFixed(2),
    ).toBe("150000.00");
  });

  it("returns zero for zero probability", () => {
    expect(
      calculateRiskExposure({ probabilityPercent: "0", financialImpact: "1000000" }).toFixed(2),
    ).toBe("0.00");
  });
});
