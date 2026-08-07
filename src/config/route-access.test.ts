import { describe, expect, it } from "vitest";
import { canAccessNavRoute, NAV_ROUTE_PERMISSIONS } from "@/config/route-access";
import type { RoleAssignment, RoleCode } from "@/domain/auth/permissions";

const ENTITY_ID = "11111111-1111-1111-1111-111111111102";
const ORGANIZATION_ID = "11111111-1111-1111-1111-111111111101";

function assignment(roleCode: RoleCode, group = false): RoleAssignment {
  return group
    ? {
        roleCode,
        scopeType: "group",
        scopeId: ORGANIZATION_ID,
        legalEntityIds: [ENTITY_ID],
      }
    : { roleCode, scopeType: "legal_entity", scopeId: ENTITY_ID };
}

function visibleFor(roleCode: RoleCode, group = false) {
  return Object.keys(NAV_ROUTE_PERMISSIONS).filter((key) =>
    canAccessNavRoute([assignment(roleCode, group)], key, ENTITY_ID),
  );
}

describe("permission-aware navigation", () => {
  it.each([
    ["viewer", ["operationalBudgets", "commitments", "projects", "milestones", "tasks", "reports"]],
    ["auditor", ["operationalBudgets", "commitments", "actualCosts", "projects", "auditLog", "reports"]],
    ["finance_user", ["operationalBudgets", "commitments", "actualCosts", "forecasts", "imports", "reports"]],
    ["budget_owner", ["operationalBudgets", "commitments", "forecasts", "requisitions"]],
    ["project_manager", ["commitments", "actualCosts", "forecasts", "projects", "milestones", "tasks", "reports"]],
  ] satisfies [RoleCode, string[]][])("shows only API-authorized routes for %s", (roleCode, expected) => {
    const visible = visibleFor(roleCode);
    for (const key of expected) expect(visible).toContain(key);
    if (roleCode === "viewer") {
      expect(visible).not.toContain("imports");
      expect(visible).not.toContain("auditLog");
      expect(visible).not.toContain("administration");
    }
    if (roleCode === "finance_user") {
      expect(visible).not.toContain("projects");
      expect(visible).not.toContain("administration");
    }
    if (roleCode === "project_manager") {
      expect(visible).not.toContain("operationalBudgets");
      expect(visible).not.toContain("approvalRules");
    }
  });

  it("expands group-scoped system administration across its legal entities", () => {
    expect(visibleFor("system_administrator", true)).toEqual(
      Object.keys(NAV_ROUTE_PERMISSIONS),
    );
  });

  it("does not project a group assignment into an unrelated legal entity", () => {
    expect(
      canAccessNavRoute(
        [assignment("system_administrator", true)],
        "administration",
        "12111111-1111-1111-1111-111111111102",
      ),
    ).toBe(false);
  });
});
