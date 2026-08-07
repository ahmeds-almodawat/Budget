import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canApproveOwnProgress,
  violatesSegregationOfDuties,
  isReadOnlyRole,
  type RoleAssignment,
} from "@/domain/auth/permissions";

describe("permissions", () => {
  const financeAssignment: RoleAssignment[] = [
    { roleCode: "finance_user", scopeType: "legal_entity", scopeId: "le-1" },
  ];

  it("grants read to finance user on actuals", () => {
    expect(hasPermission(financeAssignment, "actual", "read", "le-1")).toBe(true);
  });

  it("denies budget approval to finance user", () => {
    expect(hasPermission(financeAssignment, "budget", "approve", "le-1")).toBe(false);
  });

  it("does not let a role in legal entity B authorize legal entity A", () => {
    expect(
      hasPermission(
        [{ roleCode: "finance_user", scopeType: "legal_entity", scopeId: "le-b" }],
        "actual",
        "read",
        "le-a",
      ),
    ).toBe(false);
  });

  it("limits a group assignment to entities derived from its active membership", () => {
    const group: RoleAssignment[] = [{
      roleCode: "system_administrator",
      scopeType: "group",
      scopeId: "org-a",
      legalEntityIds: ["le-a", "le-a2"],
    }];
    expect(hasPermission(group, "budget", "approve", "le-a2")).toBe(true);
    expect(hasPermission(group, "budget", "approve", "le-b")).toBe(false);
  });

  it("does not promote a project assignment to entity-wide authority", () => {
    const project: RoleAssignment[] = [{
      roleCode: "project_manager",
      scopeType: "project",
      scopeId: "project-1",
    }];
    expect(hasPermission(project, "project", "update", {
      legalEntityId: "le-a",
      scopeType: "project",
      scopeId: "project-1",
    })).toBe(true);
    expect(hasPermission(project, "project", "update", {
      legalEntityId: "le-a",
      scopeType: "project",
      scopeId: "project-2",
    })).toBe(false);
    expect(hasPermission(project, "project", "update", "le-a")).toBe(false);
  });

  it("prevents employee from approving own progress", () => {
    expect(canApproveOwnProgress("employee", true)).toBe(false);
  });

  it("allows approver to approve others progress", () => {
    expect(canApproveOwnProgress("approver", false)).toBe(true);
  });

  it("detects segregation of duties for budget owner", () => {
    expect(violatesSegregationOfDuties("budget_owner", "budget_owner", "budget")).toBe(true);
  });

  it("marks auditor as read only", () => {
    expect(isReadOnlyRole("auditor")).toBe(true);
    expect(isReadOnlyRole("project_manager")).toBe(false);
  });
});
