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
  { route: "/approvals", module: "governance", status: "functional", evidence: "delegated inbox resolution and act-as-delegate decisions" },
  { route: "/audit", module: "audit", status: "functional", evidence: "append-only tenant-scoped audit search" },
  { route: "/budgets", module: "financial", status: "functional", evidence: "hospital and revenue budget workflows" },
  { route: "/budgets/transactions/[lineId]", module: "financial", status: "functional", evidence: "budget-line transaction drill-down" },
  { route: "/changes", module: "projects", status: "functional", evidence: "schedule-change request workflow" },
  { route: "/commitments", module: "financial", status: "functional", evidence: "commitment and linked purchase-order balances" },
  { route: "/contracts", module: "procurement", status: "functional", evidence: "procurement contract create, approve, and activate" },
  { route: "/cost-control", module: "financial", status: "functional", evidence: "expense, revenue, and profitability budget-versus-actual control" },
  { route: "/dashboard/executive", module: "insights", status: "functional", evidence: "database financial and milestone aggregates" },
  { route: "/dashboard/hospital", module: "operations", status: "functional", evidence: "hospital MTD/YTD control data" },
  { route: "/dashboard/restaurant", module: "operations", status: "functional", evidence: "tenant-scoped restaurant performance view" },
  { route: "/decisions", module: "projects", status: "functional", evidence: "database decision register" },
  { route: "/delegations", module: "governance", status: "functional", evidence: "delegation lifecycle resolved into approval inbox" },
  { route: "/evaluations", module: "procurement", status: "functional", evidence: "sourcing evaluation submit and award create/approve" },
  { route: "/exceptions", module: "audit", status: "functional", evidence: "variance, unmapped, and notification queues" },
  { route: "/forecasts", module: "financial", status: "functional", evidence: "transactional forecast state machine and supersede" },
  { route: "/imports", module: "financial", status: "functional", evidence: "validated actual-import workflow" },
  { route: "/issues", module: "projects", status: "functional", evidence: "database issue register" },
  { route: "/master-data", module: "governance", status: "functional", evidence: "full record types, hierarchy browser, deactivate and reject" },
  { route: "/milestones", module: "projects", status: "functional", evidence: "milestone register" },
  { route: "/milestones/[id]", module: "projects", status: "functional", evidence: "milestone progress, verification, and acceptance" },
  { route: "/milestones/progress-approval", module: "projects", status: "functional", evidence: "progress approval queue" },
  { route: "/payment-requests", module: "procurement", status: "functional", evidence: "payment request create, submit, and approve (ready-for-payment)" },
  { route: "/performance", module: "performance", status: "functional", evidence: "scorecard, my appraisal, team, and cycle administration" },
  { route: "/performance/appraisals/[id]", module: "performance", status: "functional", evidence: "appraisal self/manager submit, finalize, and acknowledge" },
  { route: "/period-close", module: "governance", status: "functional", evidence: "readiness evaluation, checklist blockers, and senior reopen gate" },
  { route: "/projects", module: "projects", status: "functional", evidence: "authorized control-scope catalog" },
  { route: "/projects/[id]", module: "projects", status: "functional", evidence: "project EVM dashboard" },
  { route: "/projects/[id]/timeline", module: "projects", status: "functional", evidence: "baseline and forecast timeline" },
  { route: "/purchase-orders", module: "procurement", status: "functional", evidence: "PO create-from-award, submit, approve, issue, and cancel commands" },
  { route: "/quotations", module: "procurement", status: "functional", evidence: "supplier quotation create against open RFQs" },
  { route: "/receipts", module: "procurement", status: "functional", evidence: "goods receipt create and accept commands" },
  { route: "/reports", module: "reports", status: "functional", evidence: "eleven-report database catalog with safe export" },
  { route: "/requisitions", module: "procurement", status: "functional", evidence: "requisition draft, line upsert, submit, department/budget/approve workflow" },
  { route: "/rfqs", module: "procurement", status: "functional", evidence: "RFQ create from requisition, invite, issue, and close responses" },
  { route: "/risks", module: "projects", status: "functional", evidence: "database risk register and exposure" },
  { route: "/service-entries", module: "procurement", status: "functional", evidence: "service entry create and accept commands" },
  { route: "/supplier-invoices", module: "procurement", status: "functional", evidence: "supplier invoice create, match, override, and approve" },
  { route: "/tasks", module: "projects", status: "functional", evidence: "phase, work-package, and task hierarchy" },
];

export const PRIMARY_ROUTE_PATHS = ROUTE_INVENTORY
  .filter((entry) => !entry.route.includes("["))
  .map((entry) => entry.route);
