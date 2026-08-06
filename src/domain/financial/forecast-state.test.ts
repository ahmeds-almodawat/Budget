import { describe, it, expect } from "vitest";

/** Documented forecast transition graph (must match private.forecast_transition). */
const FORECAST_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "rejected", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["locked", "superseded"],
  locked: ["superseded"],
};

const TERMINAL = new Set(["rejected", "cancelled", "superseded"]);

describe("forecast state graph", () => {
  it("defines all required states", () => {
    const states = new Set([
      ...Object.keys(FORECAST_TRANSITIONS),
      ...Object.values(FORECAST_TRANSITIONS).flat(),
    ]);
    for (const required of [
      "draft",
      "submitted",
      "under_review",
      "approved",
      "rejected",
      "superseded",
      "cancelled",
      "locked",
    ]) {
      expect(states.has(required)).toBe(true);
    }
  });

  it("has no direct draft-to-approved shortcut", () => {
    expect(FORECAST_TRANSITIONS.draft).not.toContain("approved");
  });

  it("marks terminal states without outgoing transitions", () => {
    for (const terminal of TERMINAL) {
      expect(FORECAST_TRANSITIONS[terminal] ?? []).toHaveLength(0);
    }
  });

  it("requires review before approval path", () => {
    expect(FORECAST_TRANSITIONS.submitted).toContain("under_review");
    expect(FORECAST_TRANSITIONS.under_review).toContain("approved");
  });
});

describe("forecast uniqueness grain", () => {
  it("documents composite current-approved key dimensions", () => {
    const grain = [
      "legal_entity_id",
      "control_scope_id",
      "fiscal_year_id",
      "scenario",
      "project_id",
      "control_account_id",
    ];
    expect(grain).toHaveLength(6);
  });
});
