export const ROLES = [
  "system_administrator",
  "group_executive",
  "legal_entity_administrator",
  "pmo_director",
  "project_manager",
  "cost_controller",
  "finance_user",
  "procurement_user",
  "department_manager",
  "budget_owner",
  "milestone_owner",
  "approver",
  "auditor",
  "employee",
  "viewer",
] as const;

export type RoleCode = (typeof ROLES)[number];

export type PermissionAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "import"
  | "export"
  | "allocate";

export type PermissionResource =
  | "organization"
  | "budget"
  | "project"
  | "milestone"
  | "task"
  | "commitment"
  | "actual"
  | "forecast"
  | "variance"
  | "master_data"
  | "approval"
  | "audit"
  | "report";

const ROLE_PERMISSIONS: Record<RoleCode, Partial<Record<PermissionResource, PermissionAction[]>>> = {
  system_administrator: {
    organization: ["create", "read", "update", "delete", "approve"],
    budget: ["create", "read", "update", "delete", "approve", "export"],
    project: ["create", "read", "update", "delete", "approve"],
    milestone: ["create", "read", "update", "delete", "approve"],
    task: ["create", "read", "update", "delete", "approve"],
    commitment: ["create", "read", "update", "delete", "approve"],
    actual: ["create", "read", "update", "import", "allocate", "approve"],
    forecast: ["create", "read", "update", "approve"],
    variance: ["create", "read", "update", "approve"],
    master_data: ["create", "read", "update", "delete", "approve"],
    approval: ["read", "approve"],
    audit: ["read", "export"],
    report: ["read", "export"],
  },
  group_executive: {
    budget: ["read", "approve", "export"],
    project: ["read", "approve"],
    milestone: ["read", "approve"],
    actual: ["read"],
    forecast: ["read", "approve"],
    variance: ["read", "approve"],
    report: ["read", "export"],
    audit: ["read"],
  },
  legal_entity_administrator: {
    organization: ["create", "read", "update", "approve"],
    budget: ["create", "read", "update", "approve", "export"],
    project: ["create", "read", "update", "approve"],
    master_data: ["create", "read", "update", "approve"],
    report: ["read", "export"],
    audit: ["read"],
  },
  pmo_director: {
    project: ["create", "read", "update", "approve"],
    milestone: ["create", "read", "update", "approve"],
    task: ["create", "read", "update", "approve"],
    forecast: ["create", "read", "update", "approve"],
    report: ["read", "export"],
  },
  project_manager: {
    project: ["create", "read", "update"],
    milestone: ["create", "read", "update"],
    task: ["create", "read", "update"],
    commitment: ["read"],
    actual: ["read"],
    forecast: ["create", "read", "update"],
    variance: ["create", "read", "update"],
    report: ["read", "export"],
  },
  cost_controller: {
    budget: ["create", "read", "update"],
    commitment: ["create", "read", "update"],
    actual: ["read", "import", "allocate"],
    forecast: ["create", "read", "update"],
    variance: ["create", "read", "update", "approve"],
    report: ["read", "export"],
  },
  finance_user: {
    budget: ["read", "export"],
    actual: ["read", "import", "allocate"],
    commitment: ["read"],
    forecast: ["read"],
    variance: ["read", "update"],
    report: ["read", "export"],
  },
  procurement_user: {
    commitment: ["create", "read", "update"],
    actual: ["read"],
    report: ["read"],
  },
  department_manager: {
    budget: ["read", "update"],
    milestone: ["read", "update"],
    task: ["read", "update"],
    variance: ["create", "read", "update"],
    report: ["read"],
  },
  budget_owner: {
    budget: ["create", "read", "update"],
    forecast: ["create", "read", "update"],
    variance: ["create", "read", "update"],
  },
  milestone_owner: {
    milestone: ["read", "update"],
    task: ["read", "update"],
  },
  approver: {
    budget: ["read", "approve"],
    project: ["read", "approve"],
    milestone: ["read", "approve"],
    commitment: ["read", "approve"],
    actual: ["read", "approve"],
    variance: ["read", "approve"],
    approval: ["read", "approve"],
  },
  auditor: {
    budget: ["read"],
    project: ["read"],
    actual: ["read"],
    audit: ["read", "export"],
    report: ["read", "export"],
  },
  employee: {
    task: ["read", "update"],
    milestone: ["read", "update"],
  },
  viewer: {
    budget: ["read"],
    project: ["read"],
    milestone: ["read"],
    task: ["read"],
    report: ["read"],
  },
};

export interface RoleAssignment {
  roleCode: RoleCode;
  scopeType: "group" | "legal_entity" | "organization_unit" | "control_scope" | "project" | "control_account";
  scopeId: string;
  effectiveStart?: string;
  effectiveEnd?: string | null;
  /** Legal entities derived from an active membership, never from the role alone. */
  legalEntityIds?: string[];
}

export interface AuthorizationScope {
  legalEntityId: string;
  organizationId?: string;
  scopeType?: Exclude<RoleAssignment["scopeType"], "group" | "legal_entity">;
  scopeId?: string;
}

function assignmentMatchesScope(
  assignment: RoleAssignment,
  target: AuthorizationScope,
): boolean {
  if (assignment.scopeType === "group") {
    return (
      assignment.scopeId === target.organizationId ||
      assignment.legalEntityIds?.includes(target.legalEntityId) === true
    );
  }
  if (assignment.scopeType === "legal_entity") {
    return assignment.scopeId === target.legalEntityId;
  }
  if (target.scopeType && target.scopeId) {
    return assignment.scopeType === target.scopeType && assignment.scopeId === target.scopeId;
  }
  if (target.legalEntityId && assignment.legalEntityIds?.includes(target.legalEntityId)) {
    return true;
  }
  return false;
}

export function hasPermission(
  assignments: RoleAssignment[],
  resource: PermissionResource,
  action: PermissionAction,
  scope?: string | AuthorizationScope,
): boolean {
  const target = typeof scope === "string" ? { legalEntityId: scope } : scope;
  for (const assignment of assignments) {
    const perms = ROLE_PERMISSIONS[assignment.roleCode]?.[resource];
    if (!perms?.includes(action)) continue;
    if (target && !assignmentMatchesScope(assignment, target)) {
      continue;
    }
    return true;
  }
  return false;
}

export function canApproveOwnProgress(
  roleCode: RoleCode,
  isOwnSubmission: boolean,
): boolean {
  if (!isOwnSubmission) return true;
  return roleCode === "system_administrator" || roleCode === "approver";
}

export function violatesSegregationOfDuties(
  requesterRole: RoleCode,
  approverRole: RoleCode,
  resource: PermissionResource,
): boolean {
  if (requesterRole === approverRole && resource === "budget") {
    return requesterRole === "budget_owner";
  }
  return false;
}

export function isReadOnlyRole(roleCode: RoleCode): boolean {
  return roleCode === "auditor" || roleCode === "viewer";
}
