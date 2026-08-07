import { describe, expect, it } from "vitest";
import {
  assertCriteriaWeightsSumTo100,
  calculateWeightedAppraisalScore,
} from "@/domain/performance/appraisal-scoring";

describe("appraisal scoring", () => {
  const criteria = [
    { criterionId: "c1", weight: "40", maxScale: "5" },
    { criterionId: "c2", weight: "60", maxScale: "5" },
  ];

  it("accepts weights that sum to 100", () => {
    const result = assertCriteriaWeightsSumTo100(criteria);
    expect(result.valid).toBe(true);
    expect(result.total.toFixed(0)).toBe("100");
  });

  it("rejects weights that do not sum to 100", () => {
    const result = assertCriteriaWeightsSumTo100([
      { criterionId: "c1", weight: "50", maxScale: "5" },
      { criterionId: "c2", weight: "40", maxScale: "5" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.total.toFixed(0)).toBe("90");
  });

  it("computes weighted score with Decimal precision", () => {
    const score = calculateWeightedAppraisalScore(criteria, [
      { criterionId: "c1", managerRating: "4" },
      { criterionId: "c2", managerRating: "5" },
    ]);
    // (4/5)*40 + (5/5)*60 = 32 + 60 = 92
    expect(score.toFixed(4)).toBe("92.0000");
  });

  it("prefers calibrated rating over manager rating", () => {
    const score = calculateWeightedAppraisalScore(criteria, [
      { criterionId: "c1", calibratedRating: "5", managerRating: "1" },
      { criterionId: "c2", calibratedRating: "5", managerRating: "1" },
    ]);
    expect(score.toFixed(4)).toBe("100.0000");
  });

  it("throws when weights are invalid", () => {
    expect(() =>
      calculateWeightedAppraisalScore(
        [{ criterionId: "c1", weight: "10", maxScale: "5" }],
        [{ criterionId: "c1", managerRating: "5" }],
      ),
    ).toThrow(/must sum to 100/);
  });
});
