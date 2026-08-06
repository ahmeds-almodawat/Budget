import type {
  PermissionAction,
  PermissionResource,
  RoleAssignment,
} from "@/domain/auth/permissions";
import { hasPermission } from "@/domain/auth/permissions";

export interface RoutePermission {
  resource: PermissionResource;
  action: PermissionAction;
}

export const NAV_ROUTE_PERMISSIONS = {
  executiveDashboard: { resource: "budget", action: "read" },
  operationalBudgets: { resource: "budget", action: "read" },
  costControl: { resource: "budget", action: "read" },
  commitments: { resource: "commitment", action: "read" },
  actualCosts: { resource: "actual", action: "read" },
  forecasts: { resource: "forecast", action: "read" },
  imports: { resource: "actual", action: "import" },
  projects: { resource: "project", action: "read" },
  milestones: { resource: "milestone", action: "read" },
  tasks: { resource: "task", action: "read" },
  changes: { resource: "project", action: "read" },
  risksIssues: { resource: "project", action: "read" },
  approvals: { resource: "approval", action: "read" },
  delegations: { resource: "approval", action: "read" },
  requisitions: { resource: "commitment", action: "read" },
  purchaseOrders: { resource: "commitment", action: "read" },
  periodClose: { resource: "budget", action: "read" },
  approvalRules: { resource: "approval", action: "read" },
  auditLog: { resource: "audit", action: "read" },
  employeePerformance: { resource: "task", action: "read" },
  reports: { resource: "report", action: "read" },
  masterData: { resource: "master_data", action: "read" },
  administration: { resource: "organization", action: "read" },
} as const satisfies Record<string, RoutePermission>;

export type PermissionAwareNavKey = keyof typeof NAV_ROUTE_PERMISSIONS;

export function getNavRoutePermission(key: string): RoutePermission | null {
  return key in NAV_ROUTE_PERMISSIONS
    ? NAV_ROUTE_PERMISSIONS[key as PermissionAwareNavKey]
    : null;
}

export function canAccessNavRoute(
  assignments: RoleAssignment[],
  key: string,
  legalEntityId: string,
): boolean {
  const permission = getNavRoutePermission(key);
  return permission
    ? hasPermission(
        assignments,
        permission.resource,
        permission.action,
        legalEntityId,
      )
    : true;
}
