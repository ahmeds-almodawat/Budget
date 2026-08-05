import { describe, it, expect } from "vitest";
import { allocateByPercent, reconcileAllocations } from "@/lib/money";

describe("money utilities", () => {
  it("allocates by percent with rounding reconciliation", () => {
    const parts = allocateByPercent("100", ["33.33", "33.33", "33.34"]);
    const total = parts.reduce((s, p) => s + p.toNumber(), 0);
    expect(total).toBeCloseTo(100, 2);
  });

  it("validates allocation reconciliation", () => {
    const result = reconcileAllocations("1000", ["600", "400"]);
    expect(result.valid).toBe(true);
  });

  it("rejects over-allocation", () => {
    const result = reconcileAllocations("1000", ["600", "500"]);
    expect(result.valid).toBe(false);
  });
});
