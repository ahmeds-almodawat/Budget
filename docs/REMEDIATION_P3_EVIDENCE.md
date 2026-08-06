# P3 Reporting and Ingress Remediation Evidence

**Branch:** `fix/audit-p3-reporting-ingress`  
**Base:** `fix/audit-p2-financial-transactions`  
**Date:** 2026-08-06

## Scope

- COD-H-008 — CSV-only import; vulnerable `xlsx` removed from production dependencies
- COD-H-011 — Authoritative reporting views and EVM inputs from database
- COD-H-013 — Central spreadsheet-safe CSV/XLSX export via `exceljs`
- COD-M-004 — Active legal-entity context replaces hardcoded tenant in server actions
- COD-M-007 — Targeted reporting/RLS indexes
- COD-M-008 — Expanded unit/integration tests
- COD-H-006 — Budget change integration coverage
- COD-L-001 — Turbopack root and isolated E2E port

## Migration

- `20260806090000_p3_reporting_forecast_indexes.sql` — rebuilds `v_budget_vs_actual`, adds `v_hospital_period_performance`, `v_project_earned_value`, forecast workflow columns, indexes.
- `20260806100000_p3_budget_change_approve_fix.sql` — fixes COD-H-006 immutability trigger conflict on change approval.

## Catalog counts (live, post-P3)

| Object | Count |
|--------|------:|
| Public tables | 55 |
| RLS-enabled tables | 55 |
| Forced-RLS tables | 55 |
| Authenticated policies | 85 |
| Security-invoker views | 5 |
| Public RPC wrappers | 14 |
| Private functions | 37 |
| Migrations | 28 |

## Parser disposition

- **Import:** UTF-8 CSV only (`src/lib/import/secure-csv.ts`); Excel uploads rejected with user-facing message
- **Export:** `exceljs` with explicit text cell types (`src/lib/export/spreadsheet-safe.ts`)
- **Removed:** `xlsx@0.18.5` (high-severity advisories eliminated from direct dependencies)

## Upload limits (defaults)

| Limit | Value |
|-------|------:|
| maxBytes | 5_242_880 (5 MiB) |
| maxRows | 25,000 |
| maxColumns | 64 |
| maxCellLength | 4_096 |
| maxLineLength | 65_536 |

## Active tenant model

Cookie `ecp_active_legal_entity_id` (httpOnly) validated against membership-derived allow-list. Single-entity users auto-resolve without selection.

## CI evidence

| Field | Value |
|-------|-------|
| Exact head SHA | _pending first green P3 run_ |
| Run URL | _pending_ |
