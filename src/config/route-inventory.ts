export type RouteCompletionStatus = "functional" | "functional_partial";

export interface RouteInventoryEntry {
  route: string;
  module: string;
  status: RouteCompletionStatus;
  evidence: string;
  rationale?: string;
}

export const ROUTE_INVENTORY: RouteInventoryEntry[] = [
  { route: "/", module: "platform", status: "functional", evidence: "tenant summary and budget snapshot" },
  { route: "/actions", module: "projects", status: "functional", evidence: "database action register" },
  { route: "/actuals", module: "financial", status: "functional", evidence: "posted actual, import, duplicate, and allocation queues" },
  { route: "/administration", module: "administration", status: "functional_partial", evidence: "database membership and scoped-role inventory", rationale: "Read-only inventory; production identity administration is excluded" },
  { route: "/approval-rules", module: "governance", status: "functional_partial", evidence: "versioned rule catalog and simulation", rationale: "Rule retention on workflow submission remains unimplemented" },
  { route: "/approvals", module: "governance", status: "functional_partial", evidence: "database approval inbox", rationale: "Delegated inbox resolution remains unimplemented" },
  { route: "/audit", module: "audit", status: "functional", evidence: "append-only tenant-scoped audit search" },
  { route: "/budgets", module: "financial", status: "functional", evidence: "hospital and revenue budget workflows" },
  { route: "/budgets/transactions/[lineId]", module: "financial", status: "functional", evidence: "budget-line transaction drill-down" },
  { route: "/changes", module: "projects", status: "functional", evidence: "schedule-change request workflow" },
  { route: "/commitments", module: "financial", status: "functional", evidence: "commitment and linked purchase-order balances" },
  { route: "/cost-control", module: "financial", status: "functional", evidence: "expense, revenue, and profitability budget-versus-actual control" },
  { route: "/dashboard/executive", module: "insights", status: "functional", evidence: "database financial and milestone aggregates" },
  { route: "/dashboard/hospital", module: "operations", status: "functional", evidence: "hospital MTD/YTD control data" },
  { route: "/dashboard/restaurant", module: "operations", status: "functional", evidence: "tenant-scoped restaurant performance view" },
  { route: "/decisions", module: "projects", status: "functional", evidence: "database decision register" },
  { route: "/delegations", module: "governance", status: "functional_partial", evidence: "delegation lifecycle workspace", rationale: "Delegations are not resolved into the approval inbox" },
  { route: "/exceptions", module: "audit", status: "functional", evidence: "variance, unmapped, and notification queues" },
  { route: "/forecasts", module: "financial", status: "functional", evidence: "transactional forecast state machine and supersede" },
  { route: "/imports", module: "financial", status: "functional", evidence: "validated actual-import workflow" },
  { route: "/issues", module: "projects", status: "functional", evidence: "database issue register" },
  { route: "/master-data", module: "governance", status: "functional_partial", evidence: "governed master-record lifecycle", rationale: "The UI does not expose every record type or hierarchy browser" },
  { route: "/milestones", module: "projects", status: "functional", evidence: "milestone register" },
  { route: "/milestones/[id]", module: "projects", status: "functional", evidence: "milestone progress, verification, and acceptance" },
  { route: "/milestones/progress-approval", module: "projects", status: "functional", evidence: "progress approval queue" },
  { route: "/performance", module: "performance", status: "functional_partial", evidence: "database team milestone scorecard", rationale: "No broader employee appraisal, target, or review lifecycle" },
  { route: "/period-close", module: "governance", status: "functional_partial", evidence: "module period close and reopen controls", rationale: "Checklist blockers and senior reopen gate remain incomplete" },
  { route: "/projects", module: "projects", status: "functional", evidence: "authorized control-scope catalog" },
  { route: "/projects/[id]", module: "projects", status: "functional", evidence: "project EVM dashboard" },
  { route: "/projects/[id]/timeline", module: "projects", status: "functional", evidence: "baseline and forecast timeline" },
  { route: "/purchase-orders", module: "procurement", status: "functional_partial", evidence: "database PO, supplier-invoice, and payment-request read catalog", rationale: "No PO, receipt, matching, invoice, or payment commands" },
  { route: "/reports", module: "reports", status: "functional", evidence: "eleven-report database catalog with safe export" },
  { route: "/requisitions", module: "procurement", status: "functional_partial", evidence: "requisition draft and submission workflow", rationale: "Only draft and submit are exposed; downstream procurement is absent" },
  { route: "/risks", module: "projects", status: "functional", evidence: "database risk register and exposure" },
  { route: "/tasks", module: "projects", status: "functional", evidence: "phase, work-package, and task hierarchy" },
];

export const PRIMARY_ROUTE_PATHS = ROUTE_INVENTORY
  .filter((entry) => !entry.route.includes("["))
  .map((entry) => entry.route);
