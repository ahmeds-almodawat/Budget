# Revenue Control Model

This document describes the revenue, gross-to-net, variance, and profitability semantics implemented in the P6 revenue control patch on `feat/mega-finish-platform`.

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

- `net_only` — planned amount is net revenue
- `component_based` — gross and deductions budgeted separately; mixing bases in one version is blocked

## Commitments

Open commitments appear as `commitment_open_current` from `v_commitment_current_snapshot` at control-account grain — **not** repeated per fiscal period row.

Revenue, internal transfer, and statistical rows show zero commitment.

## Reporting grains

`v_budget_vs_actual` unions budget-only, actual-only, and matched dimensional keys (period, org unit, cost node, payer, service line, component).

Dedicated views:

- `v_revenue_budget_vs_actual`
- `v_profitability_period_performance`
- Updated `v_hospital_period_performance` and `v_restaurant_branch_performance`

## Known limitations

- Production ERP mapping catalog is incomplete; unmapped rows remain in review queues.
- Statutory net profit, finance cost, zakat, and tax are out of scope.
- Component-based revenue budget UI entry is partially scaffolded.
- Malware scanning for attachments remains deferred.

## Local verification

Run from clean local Supabase only. Do not use production credentials.
