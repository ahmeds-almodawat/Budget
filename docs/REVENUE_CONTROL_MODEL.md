# Revenue Control Model

This document describes the revenue, gross-to-net, variance, and profitability semantics implemented in the P6 revenue control patch on `feat/mega-finish-platform`, completed by the revenue control closure patch.

## Source amount vs reporting amount

- **Source amount** (`actual_transactions.amount_ex_vat`, `actual_transaction_allocations.source_allocation_amount`) preserves the imported ERP/sign convention unchanged.
- **Reporting amount** (`actual_transaction_allocations.reporting_amount_ex_vat`) is the management-reporting normalization used in views and KPIs.
- Reversals negate the normalized effect via `actual_transactions.is_reversal` and component multipliers — never blind `ABS()` on source rows.

## Sign normalization

`gl_reporting_rules` (server-only) and allocation triggers document auditable mapping from GL/source balance to management sign. Default backfill uses classification-aware magnitude for posted allocations.

## Revenue components

Reference table `revenue_component_types`:

| Code | Net effect |
|------|------------|
| gross_revenue | +1 |
| rejection, discount, refund, credit_note, other_deduction | -1 |
| other_adjustment | explicitly signed |

**Net revenue** = gross − rejections − discounts − refunds − credit notes − other deductions ± other adjustments.

## VAT

Budget vs actual revenue uses **amount excluding VAT**. Recoverable VAT is excluded from operating cost; non-recoverable VAT may be allocated via `non_recoverable_vat_allocated`.

## Internal transfers

`transaction_class` distinguishes external vs internal. Consolidated external net revenue excludes internal/intercompany/interbranch/shared-service/allocation/elimination classes.

## Variance formulas

**Revenue:** `actual net − budget` (favorable when actual > budget)

**Expense:** `budget − actual` (favorable when actual < budget)

**Zero budget:** variance amount reported; variance percentage `NULL`; status `unbudgeted` when actual ≠ 0.

## Profitability

- Gross profit = net revenue − cost of revenue
- Gross margin = gross profit / net revenue
- Operating contribution = net revenue − cost of revenue − payroll − operating expenses
- CAPEX is reported separately and **not** included in operating contribution

## Budget methods

Revenue budget lines support `revenue_budget_basis`:

- `net_only` — planned amount is net revenue; quantity × rate driver preview shown; manual planned amount is not silently overwritten
- `component_based` — gross and deduction components budgeted separately; deductions entered as positive magnitudes; derived net preview reconciles monthly and annual totals

Mixing bases in one version is blocked. Basis changes require explicit user confirmation in the UI; approved/locked/posted versions are read-only.

### Component-based budget entry workflow

1. User selects `component_based` on `/budgets` revenue workflow.
2. User enters annual and monthly amounts per component (gross, rejection, discount, refund, credit note, other deduction, other adjustment).
3. Domain service `calculateComponentBasedNetPreview` derives net revenue; monthly phasing must reconcile to annual component totals.
4. `saveRevenueDraftBudgetAction` validates basis consistency and persists via `createDraftBudgetVersion` in a typed repository transaction with audit events.

### Net-only budget entry workflow

1. User selects `net_only`.
2. User enters quantity, unit rate, planned net amount, payer, service line, assumptions, and monthly phasing.
3. Driver amount (quantity × rate) and difference from entered amount are displayed; database validation remains authoritative.

## CSV export

Budget vs Actual workspace exports UTF-8 CSV (BOM-prefixed) for revenue detail, expense detail, and profitability via `exportBudgetVsActualCsvAction`.

- Deterministic column and row order
- Raw numeric financial values (not formatted display strings)
- Arabic text preserved
- Filename pattern: `{report-type}-{YYYY-MM-DD}.csv`

### Formula-injection protection

Text fields (payer name, service line, notes, assumptions, labels) pass through `neutralizeCsvCell` in `spreadsheet-safe.ts`. Cells beginning with `=`, `+`, `-`, or `@` receive a leading single-quote prefix. Numeric financial columns remain numeric. Strategy is covered by unit tests in `revenue-bva-export.test.ts` and `spreadsheet-safe.test.ts`.

## Commitments

Open commitments appear as `commitment_open_current` from `v_commitment_current_snapshot` at control-account grain — **not** repeated per fiscal period row.

Revenue, internal transfer, and statistical rows show zero commitment.

## Reporting grains

`v_budget_vs_actual` unions budget-only, actual-only, and matched dimensional keys (period, org unit, cost node, payer, service line, component).

Dedicated views:

- `v_revenue_budget_vs_actual`
- `v_profitability_period_performance`
- Updated `v_hospital_period_performance` and `v_restaurant_branch_performance`

## npm audit status (closure patch)

- **Advisory:** `uuid` ≤7.x (moderate) via `exceljs` transitive dependency
- **Path:** `enterprise-control-platform` → `exceljs` → `uuid`
- **Remediation attempted:** No compatible direct upgrade or override without breaking ExcelJS; dependencies unchanged
- **Reachability:** Application uses ExcelJS for spreadsheet export; vulnerable UUID API surface is not invoked directly by application code
- **Compensating controls:** Server-side export only; no user-controlled UUID generation via ExcelJS path

## Clean install verification

Closure patch ran `npm ci` from committed `package-lock.json`. See closure session verification log for exit code, warnings, and test counts.

## Test coverage (closure patch)

| Suite | Scope |
|-------|--------|
| Vitest unit | Domain revenue budget, CSV export exact values, formula injection, filter/error transforms (116 passed, 7 skipped when local revenue view empty via Supabase client) |
| Integration | 18 revenue repository scenarios (filters, isolation, basis retrieval, profitability) |
| DB | 30 P6 revenue + 23 core tests (2× reset cycles) |
| Playwright | Revenue budget workflow, export, RTL, access control |
| i18n | 556+ keys including `revenueBudget` namespace |

## Completed (mega + closure)

- Revenue planning and gross-to-net actuals
- Profitability bridge
- Component-based and net-only budget entry UI
- Revenue CSV export with injection protection
- Repository filter and integration coverage

## Intentionally deferred

- Production ERP mapping catalog completion
- Statutory net-profit, zakat, and tax calculations
- Production deployment and data migration
- Visual theme / dual-theme redesign

These deferred items are **not** failed implementation — they are out of closure scope.

## Local verification

Run from clean local Supabase only. Do not use production credentials.
