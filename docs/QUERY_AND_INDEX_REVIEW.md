# Query and Index Review (COD-M-007)

## Approach

Indexes added based on observed access paths in RLS predicates, reporting views, and repository queries — not a blanket recreation of all 111 historical suggestions.

## Indexes added (P3 migration)

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_budget_versions_current_scope` | `budget_versions` | Current approved version lookup by entity + scope |
| `idx_actual_transactions_posted_period` | `actual_transactions` | Posted actuals by entity + period |
| `idx_actual_allocations_org_cost` | `actual_transaction_allocations` | BvA join on org unit + cost node |
| `idx_role_assignments_user_effective` | `role_assignments` | RLS membership/effective date predicates |
| `idx_import_batches_entity_status` | `import_batches` | Import workflow inbox by entity + status |
| `idx_milestone_progress_verification` | `milestone_progress_updates` | EVM verified progress lookup |
| `idx_forecast_one_current_approved` | `forecast_versions` | One current approved forecast per scope |

## Representative queries

### Budget vs actual

```sql
SELECT * FROM v_budget_vs_actual
WHERE legal_entity_id = $1 AND control_scope_id = $2 AND fiscal_period_id = $3;
```

**Cardinality:** leaf budget line × period rows for current approved version.  
**Index support:** `idx_budget_versions_current_scope`, `idx_actual_transactions_posted_period`, `idx_actual_allocations_org_cost`.

### Hospital MTD/YTD

Aggregates `v_budget_vs_actual` by scope and period; window functions for YTD.

### EVM

Joins control accounts to time-phased budget, verified milestones, and posted allocations.

## Write-cost impact

Partial indexes on `is_current_approved = true` and `is_posted = true` minimize write amplification versus full-table indexes.

## EXPLAIN analysis

Formal `EXPLAIN (ANALYZE, BUFFERS)` runs require production-shaped fixture volumes. P3 adds indexes aligned to view join keys; full plan documentation deferred to post-fixture volume testing.
