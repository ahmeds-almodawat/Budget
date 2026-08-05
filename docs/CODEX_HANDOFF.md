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
| Local Supabase on isolated ports | Database-backed, tested (2× reset) |
| Migrations + triggers + RLS | Database-backed, tested (14 DB tests, 49 policies) |
| **Supabase Auth + authorization** | **Tested (15 E2E, integration, RLS)** |
| Hospital budget workflow | Database-backed, tested (integration + E2E) |
| Actual CSV/Excel import | Database-backed, E2E |
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
- Email alerts
- Excel export on reports (CSV template download only for import)

## Key commands

```bash
supabase start
supabase db reset
node scripts/sync-local-env.cjs
npm run verify
npm run test:e2e
```

## Priority next steps

1. Restaurant branch KPI workflow (revenue + food/labor % from mapped actuals)
2. Approval queue UI
3. Report export (CSV/Excel)
4. Complete RLS for remaining tables + expand DB negative tests
5. Production OAuth/SSO

See [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md) and [COMPOSER_COMPLETION_REPORT.md](./COMPOSER_COMPLETION_REPORT.md).
