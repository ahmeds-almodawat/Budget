# Codex Handoff

## Status legend

| Label | Meaning |
|-------|---------|
| **Database-backed** | Reads/writes local Supabase |
| **Tested** | Automated test executed and passed |
| **Partial** | Core path works; gaps documented |
| **Scaffold** | Route exists; no business workflow |
| **Fixture only** | TypeScript seed for tests, not runtime UI |

## Fully implemented + tested

| Feature | Status |
|---------|--------|
| Local Supabase on isolated ports | Database-backed, tested (3× reset) |
| Migrations + triggers + RLS foundation | Database-backed, tested (10 DB tests) |
| Hospital budget workflow | Database-backed, tested (integration + E2E) |
| Actual CSV/Excel import | Database-backed, partial E2E (UI load) |
| Khamis Mushait project dashboard | Database-backed, partial |
| Executive / home / hospital dashboards | Database-backed |
| Financial domain formulas | Tested (21 unit tests) |

## Partially implemented

- Budget change approval (DB + UI buttons; no full approval queue screen)
- Variance explanations (auto-created on threshold; no review UI)
- Project EV metrics (uses approved milestone progress; actuals from allocations when present)
- Employee performance (team/milestone counts from DB; not full KPI scorecard)

## Scaffold only (no mock data)

actuals, approvals, audit, changes, commitments, cost-control, forecasts, master-data, milestones, reports, risks, tasks, administration

## Blocked / not done

- Production Supabase connection (intentionally excluded)
- Full auth login UI
- Email alerts
- Excel export on reports (CSV template download only for import)

## Key commands

```bash
supabase start
supabase db reset
node scripts/sync-local-env.cjs
npm run verify
```

## Priority next steps

1. Session-based auth replacing hardcoded actor IDs in `src/app/actions/*`
2. Complete RLS for all tables + expand DB negative tests
3. Restaurant branch KPI workflow (revenue + food/labor % from mapped actuals)
4. Approval queue UI
5. Report export (CSV/Excel)

See [COMPOSER_COMPLETION_REPORT.md](./COMPOSER_COMPLETION_REPORT.md) and [DATABASE_EXECUTION_REPORT.md](./DATABASE_EXECUTION_REPORT.md).
