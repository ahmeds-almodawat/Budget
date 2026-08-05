# Codex Handoff

**Review preparation:** 2026-08-05  
**Base:** `main` @ `7d754c8` (`composer-foundation-v1`)  
**Head:** `feature/enterprise-control-platform` @ `ca51c4e` (`composer-core-modules-v1`)

## Status legend

| Label | Meaning |
|-------|---------|
| **Database-backed** | Reads/writes local Supabase |
| **Tested** | Automated test executed and passed |
| **Partial** | Core path works; gaps documented |
| **Scaffold** | Route exists; no business workflow |

## Fully implemented + tested

| Feature | Status |
|---------|--------|
| Local Supabase (isolated ports 56000–56009) | Database-backed, 16 migrations, 75 RLS policies |
| Supabase Auth + authorization | 17 E2E + integration + 15 DB tests |
| Hospital budget workflow | Database-backed, E2E multi-user |
| Actual CSV/Excel import | Database-backed, E2E |
| Project schedule & progress | Timeline, tasks, milestones, verification |
| Governance registers | Separate risks, issues, actions, decisions |
| Approvals inbox | Multi-type view (budget, import, progress, schedule, variance) |
| Actuals & commitments UI | Transactions, unmapped, batches, reversals |
| Restaurant branch KPIs | 2-branch comparison from mapped actuals |
| Audit search + exceptions | Database-backed |
| Report export | CSV/Excel with drill-down preview |
| GitHub Actions CI | `.github/workflows/ci.yml` on Linux |

## Partially implemented

- Commitments sub-tabs (contracts, invoices, payments, credit notes) — scaffolded
- Delegated approvals tab — no delegation records
- Employee performance scorecard — team counts only

## Scaffold only

`cost-control`, `forecasts`, `performance`, `administration`, `master-data`

## Verification (local 2026-08-05)

| Suite | Result |
|-------|--------|
| Vitest | 26/26 pass |
| DB | 15/15 pass |
| E2E | 17/17 pass (one complete run) |
| Build | Pass (first attempt); prior Windows worker crash documented as environmental |

**Await GitHub Actions CI** for authoritative Linux evidence before merge.

## Key commands

```bash
supabase start
supabase db reset
node scripts/sync-local-env.cjs
npm run verify
npm run test:e2e
```

## Codex audit priorities

1. RLS cross-entity isolation (75 policies — verify new tables)
2. Server-action authorization vs UI visibility
3. Financial immutability and reversal-only actuals
4. Segregation of duties (budget, progress, approvals)
5. Import reconciliation and duplicate controls
6. Schedule/milestone baseline immutability triggers
7. Local auth seed migrations must never run in production

See [COMPOSER_COMPLETION_REPORT.md](./COMPOSER_COMPLETION_REPORT.md) and [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md).
