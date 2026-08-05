# Implementation Status

> **Audit correction:** “Complete” in the historical table below means a route
> or happy path existed; it does not mean the independent audit accepted the
> module as production-complete. See `CODEX_AUDIT_REPORT.md`.

**Last updated:** 2026-08-05 (Codex review preparation)

| Module | Status | Evidence |
|--------|--------|----------|
| Auth + authorization | Remediated; CI pending | 54 forced-RLS tables, 84 explicit policies, generated privilege matrix |
| Hospital budget workflow | ✅ Complete | Integration + E2E multi-user |
| Actual import | ✅ Complete | Finance-gated server actions + E2E |
| Project schedule & progress | ✅ Complete | Timeline, tasks, milestones, verification E2E |
| Risk / issue / action / decision | ✅ Complete | Separate registers |
| Approvals workspace | ✅ Complete | Unified inbox |
| Actuals & commitments UI | ✅ Complete | Reversals-only for posted actuals |
| Restaurant operational KPIs | ✅ Complete | 2-branch comparison from mapped actuals |
| Audit & exceptions | ✅ Complete | Searchable audit + alerts |
| Reporting & export | ✅ Complete | CSV/Excel |
| GitHub Actions CI | Pending evidence | pinned toolchain and no-retry workflow added; exact-head result required |
| `main` base branch | ✅ Created | From `composer-foundation-v1` (`7d754c8`) |

## Verification snapshot (local, 2026-08-05 review prep)

| Command | Result |
|---------|--------|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | **26/26** pass, 0 skipped |
| `npm run test:db` | **15/15** pass |
| `npm run test:e2e` | **17/17** pass (one complete run) |
| `npm run build` | Pass (first attempt this run) |
| Migrations | **16** |
| RLS policies | **75** (exact `pg_policies` count) |

CI Linux results are recorded separately when the GitHub Actions workflow completes.

## Remaining gaps

- Production OAuth/SSO not configured
- Delegated approval records not wired
- Full procurement document lifecycle (contracts → invoices → payments)
- Scaffold modules: cost-control, forecasts, performance, administration, master-data
- Windows build may intermittently fail with worker exit `3221226505` (environmental; see completion report)
