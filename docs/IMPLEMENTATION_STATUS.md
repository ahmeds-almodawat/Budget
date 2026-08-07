# Implementation Status

> **Audit correction:** “Complete” in the historical table below means a route
> or happy path existed; it does not mean the independent audit accepted the
> module as production-complete. See `CODEX_AUDIT_REPORT.md`.

**Last updated:** 2026-08-06 (P3 remediation branch)

| Module | Status | Evidence |
|--------|--------|----------|
| Auth + authorization | Remediated (P0/P2); CI verified | 55 forced-RLS tables, 85 policies |
| Active tenant context | Implemented (P3) | Cookie + membership validation |
| Hospital budget workflow | Complete | Integration + E2E multi-user |
| Actual import | Secured (P3) | CSV-only bounded parser |
| Reporting & export | Rebuilt (P3) | Authoritative views + safe export |
| Forecasts | Partial (P3) | Draft/submit/approve page |
| Project EVM | Rebuilt (P3) | `v_project_earned_value` |
| GitHub Actions CI | P2 verified; P3 pending | See remediation evidence docs |

## Verification snapshot (P3 branch, pending final run)

| Command | Result |
|---------|--------|
| `npm run lint` | Pass (local) |
| `npm run typecheck` | Pass (local) |
| `npm run test` | 51+ unit/integration (fixtures required for integration) |
| `npm run test:db` | 23 pass |
| `npm run test:concurrency` | 4 pass |
| `npm run test:e2e` | 17 (CI authoritative) |
| `npm run build` | Pass (local) |
| Migrations | **28** |
| RLS policies | **85** |

CI Linux results are recorded separately when the GitHub Actions workflow completes.

## Remaining gaps

- Production OAuth/SSO not configured
- Delegated approval records not wired
- Full procurement document lifecycle (contracts → invoices → payments)
- Scaffold modules: cost-control, performance, administration, master-data
- Complete bilingual localization (partial on P3)
- Transactional forecast RPC commands
- Windows build may intermittently fail with worker exit `3221226505` (environmental)
