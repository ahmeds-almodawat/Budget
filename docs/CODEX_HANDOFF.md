# Codex Handoff

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
| Local Supabase on isolated ports | Database-backed, tested (2× reset) |
| Migrations + triggers + RLS | Database-backed, tested (15 DB tests) |
| Supabase Auth + authorization | Tested (17 E2E, integration, RLS) |
| Hospital budget workflow | Database-backed, tested |
| Actual CSV/Excel import | Database-backed, E2E |
| Project schedule & progress | Database-backed, E2E + integration |
| Governance registers | Database-backed (risks, issues, actions, decisions) |
| Approvals inbox | Database-backed, multi-type view |
| Actuals & commitments UI | Database-backed |
| Restaurant branch KPIs | Database-backed, 2-branch comparison |
| Audit search + exceptions | Database-backed |
| Report export CSV/Excel | Database-backed |

## Partially implemented

- Commitments sub-tabs (POs, contracts, invoices) — commitments and vendors populated; others await transactional data
- Delegated approvals tab — scaffolded, no delegation records yet
- Employee performance scorecard — team counts only

## Scaffold only

administration, cost-control, forecasts, master-data, performance

## Key commands

```bash
supabase start
supabase db reset
node scripts/sync-local-env.cjs
npm run verify
npm run test:e2e
```

## Priority next steps

1. Production OAuth/SSO
2. Delegation workflow for approvals
3. Full procurement document lifecycle (PO → invoice → payment)
4. Expand RLS negative tests for new tables
