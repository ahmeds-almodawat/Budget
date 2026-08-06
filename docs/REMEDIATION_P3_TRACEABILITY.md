# P3 Remediation Traceability

**Branch:** `fix/audit-p3-reporting-ingress`  
**Base:** `fix/audit-p2-financial-transactions`  
**Stacked PR:** #4

## Finding → control → evidence

| Finding | Control | Evidence |
|---------|---------|----------|
| COD-H-008 | CSV-only import; `xlsx` removed; bounded parser | `src/lib/import/secure-csv.ts`, `upload-limits.ts`, `import-actions.ts` |
| COD-H-011 | Authoritative reporting views | `v_budget_vs_actual`, `v_hospital_period_performance`, `v_project_earned_value` |
| COD-H-013 | Spreadsheet-safe export | `src/lib/export/spreadsheet-safe.ts`, `report-actions.ts` |
| COD-M-004 | Active legal-entity context | `src/lib/auth/active-context.ts`, `action-guard.ts`, entity selector |
| COD-M-007 | Targeted indexes | `20260806090000_p3_reporting_forecast_indexes.sql` |
| COD-M-008 | Unit, DB, integration, concurrency tests | Vitest + `run-db-tests.mjs` + `budget-change.integration.test.ts` |
| COD-H-006 | Budget change approval RPC | `budget_approve_change_request` + integration test |
| COD-M-010 | Bilingual catalogs (partial) | `messages/en.json`, `messages/ar.json`; forecasts + auth keys |
| COD-L-001 | Turbopack root, E2E port | `next.config.ts`, `playwright.config.ts` |
| COD-L-002 | Live catalog counts in docs | This file + `REMEDIATION_P3_EVIDENCE.md` |

## Migrations (28)

Includes P2 chain plus:

- `20260806090000_p3_reporting_forecast_indexes.sql`
- `20260806100000_p3_budget_change_approve_fix.sql`

## CI evidence

| Field | Value |
|-------|-------|
| P2 verified SHA | `9157de9` |
| P2 CI URL | https://github.com/ahmeds-almodawat/Budget/actions/runs/31077004643 |
| P3 exact-head SHA | _pending green run_ |
| P3 CI URL | _pending_ |
