# P2 Financial Transaction Remediation Evidence

**Branch:** `fix/audit-p2-financial-transactions`  
**Base:** `fix/audit-p0-authorization`  
**PR:** [#3](https://github.com/ahmeds-almodawat/Budget/pull/3)  
**Date:** 2026-08-06

## Live catalog (post-`db reset --no-seed`, branch head)

| Metric | Count |
|--------|------:|
| Migrations | **26** |
| Public tables | **55** |
| RLS-enabled public tables | **55** |
| Forced-RLS public tables | **55** |
| Policies targeting `authenticated` | **85** |
| Security-invoker views | **3** (`v_approval_inbox`, `v_budget_vs_actual`, `v_restaurant_branch_performance`) |
| Public RPC wrappers | **14** |
| Private functions | **37** |
| Auth users after production replay | **0** |
| Guarded local personas (explicit fixture) | **14** |

## Migrations added (P2)

| Migration | Scope |
|-----------|-------|
| `20260806040000_p2_command_framework_audit.sql` | Idempotency ledger, audit extensions, append-only triggers |
| `20260806040100_p2_budget_state_machine.sql` | Budget transitions, immutability, change approval |
| `20260806040200_p2_import_actuals_reversals.sql` | Import posting, actual posting, reversals |
| `20260806040300_p2_progress_schedule.sql` | Progress/schedule commands, baseline versions |
| `20260806040400_p2_rpc_definer_wrappers.sql` | Public RPC surface |
| `20260806040500_p2_budget_approve_amount_fix.sql` | Approval amount reconciliation |
| `20260806040600_p2_budget_status_transition_fix.sql` | Status transition guards |
| `20260806040700_p2_private_function_acls.sql` | Private function ACL hardening |
| `20260806040800_p2_budget_current_unique_fix.sql` | One-current-budget invariant |

## Public RPC surface

`rpc_budget_submit`, `rpc_budget_start_review`, `rpc_budget_reject`, `rpc_budget_approve_and_lock`, `rpc_budget_supersede`, `rpc_budget_approve_change_request`, `rpc_import_review_batch`, `rpc_import_post_batch`, `rpc_post_actual_transaction`, `rpc_reverse_actual_transaction`, `rpc_submit_progress`, `rpc_verify_progress`, `rpc_accept_milestone`, `rpc_schedule_approve_extension`

## TypeScript command layer

`src/lib/commands/index.ts` wraps all RPCs with typed error mapping.

## Test artifacts

| Suite | Count | Command |
|-------|------:|---------|
| Vitest (unit + integration) | **31** | `npm run test` |
| Database integrity | **23** | `npm run test:db` |
| Concurrency / idempotency | **4** | `npm run test:concurrency` |
| Playwright E2E | **17** | `npm run test:e2e` (retries **0**) |

Generated artifacts:

- `artifacts/authorization/privilege-and-policy-matrix.json` — from `npm run test:db`
- `artifacts/financial-transactions/concurrency-evidence.json` — from `npm run test:concurrency`

## CI workflow

The authoritative workflow (`.github/workflows/ci.yml`) runs on:

- pull requests targeting `main`, `feature/enterprise-control-platform`, `fix/audit-p0-authorization`, `fix/audit-p2-financial-transactions`, and `fix/audit-p3-reporting-ingress`;
- pushes to active remediation branches;
- `workflow_dispatch`.

Sequence: `npm ci` → Supabase start → `db reset --no-seed` → migration safety → guarded fixtures → lint → typecheck → Vitest → DB tests → **concurrency** → E2E → build → evidence artifacts.

## Exact-head GitHub Actions evidence

> Updated after the first green run at the CI-enabled exact head.

| Field | Value |
|-------|-------|
| Exact head SHA | _pending first green run_ |
| Workflow run URL | _pending_ |
| Result | _pending_ |

Local verification (2026-08-06, pre-CI-enablement): lint, typecheck, 31/31 Vitest, 23/23 DB, 4/4 concurrency, 61-route build passed; E2E requires isolated port in CI (`CI=true`).
