# Priority 0/1 authorization remediation evidence

**Date:** 2026-08-05
**Branch:** `fix/audit-p0-authorization`
**Target:** `feature/enterprise-control-platform`

## Implementation commits

| Commit | Scope |
|---|---|
| `c159ae316582d442f58a8223ecc79eb357c153c2` | Removes deterministic users from production migrations; adds guarded local fixtures and fresh-replay safety assertion |
| `9e7fa663ff1f4eff9c89321e8ea06aea6a948fc1` | Adds the forward authorization migration, exact grants/RLS/views/functions, scope parity, and regression matrix |
| `089421438faff45bc2335aa056f562090d56c161` | Pins and sequences CI, disables retries, adds readiness handling, and updates audit/operating documentation |

Material files are the seven modified legacy migrations/fixture safety files,
`20260805205823_authorization_boundary.sql`, authentication context and permission
domain, project-scope server/UI checks, `run-db-tests.mjs`, the CI and Playwright
configurations, and the remediation/runbook documents. The PR diff is the
authoritative complete file inventory.

## Historical first-attempt baseline

No baseline command was retried or represented as stable: install, local start,
reset, lint, typecheck, and build passed; unit/integration failed 24/26, database
failed 12/15, and E2E failed 11/17. The common failure was missing table
privileges. This matches the independent audit and contradicts older completion
reports.

## Implemented boundary

| Finding | Remediation state before final CI |
|---|---|
| COD-C-001 | Implemented: deny by default; explicit operation grants; machine-generated role matrix |
| COD-C-002 | Implemented: all three views are invoker views with explicit tenant predicates; restaurant view excludes unposted allocations |
| COD-C-003 | Implemented: fresh production replay creates zero Auth users; explicit loopback-guarded fixture |
| COD-H-001 | Implemented: 54/54 tables enable and force RLS; every table/view classified |
| COD-H-002 | Implemented: active profile/membership, effective dates, group/entity/project scope in SQL and TypeScript |
| COD-M-001 | Implemented: no public functions; empty search paths; exact helper-only execute ACLs |
| COD-H-014 | Local first-attempt sequence passes; required GitHub Actions result at exact PR head remains pending |

## Final local clean verification

- Fresh production replay: zero Auth users.
- Effective catalog: 54 tables, 54 RLS, 54 forced RLS, 84 policies explicitly
  targeting `authenticated`, three invoker views, zero public functions.
- `npm ci`: passed on first attempt; 613 packages; one pre-existing high-severity dependency warning and three install-script review warnings.
- `supabase start`: passed from a stopped isolated stack; all 17 migrations applied.
- `supabase db reset`: passed on first attempt; zero Auth users before fixture.
- Guarded local fixture: loaded 14 personas only after explicit authorization.
- Lint and TypeScript: passed.
- Vitest: 29/29 passed.
- Database: 22/22 passed and generated
  `artifacts/authorization/privilege-and-policy-matrix.json`.
- Playwright: 17/17 passed on the first attempt, retries disabled.
- Next production build: passed on first attempt; 61 routes.

No test command in the final clean sequence was retried. GitHub Actions at the
exact PR head remains pending and is not replaced by local evidence.

## CI evidence protocol

PR run `31049895766` passed every required stage on head
`36d6bfaefc5c82e88364df5a673ccb6f7ffaa2bd` in one run and uploaded the
authorization matrix. Its deprecation annotation led to pinning current official
action releases by immutable commit SHA. Because that pin changes the PR head,
the required closing evidence is the subsequent exact-head check linked on PR
`#2`; it must pass without rerun. The PR check, not a self-referential document
commit, is the authoritative final run record.

The original audit remains the source of truth for all out-of-scope findings.
