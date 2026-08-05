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
