# Reporting Grain and Lineage

**Status:** Authoritative for P3 remediation (2026-08-06)

## Mandatory dimensions (financial actuals vs budget)

| Dimension | Required | Source |
|-----------|----------|--------|
| legal_entity_id | Yes | budget_versions / actual_transactions |
| control_scope_id | Yes | budget_versions |
| fiscal_year_id | Yes | budget_versions / fiscal_periods |
| fiscal_period_id | Yes (monthly grain) | budget_monthly_allocations / accounting_period_id |
| organization_unit_id | Yes | budget_lines / allocations |
| cost_node_id | Yes (leaf) | budget_lines / allocations |
| budget_version_id | Yes | current approved only (`is_current_approved`) |
| posting_status | Yes | `actual_transactions.is_posted = true` |

## Optional dimensions

| Dimension | When used |
|-----------|-----------|
| control_account_id | Project/commitment grain |
| project_id | Project EVM (`v_project_earned_value`) |
| budget_line_id | Line drill-down |

## Rules

1. **No duplicate counting** — monthly budget grain joins posted actuals on entity + period + OU + cost node; reversals net via signed allocation amounts.
2. **Current budget** — only `is_current_approved` versions in `approved`/`locked`/`posted`.
3. **Unmatched actuals** — remain in `unmapped_transaction_queue` until dimension mapping completes.
4. **Reversals** — included with signed values; idempotent via P2 reversal RPC.
5. **Commitments** — `commitment_open` at control_account grain; zero when no commitment row exists (not implied in all reports).

## Views

- `v_budget_vs_actual` — monthly leaf grain
- `v_hospital_period_performance` — MTD/YTD/forecast by scope and period
- `v_project_earned_value` — BAC/PV/EV/AC per project control account

## Traceability

Every aggregate in hospital and project dashboards must reconcile to `v_budget_vs_actual` or `v_project_earned_value` row sums for the same filters.
