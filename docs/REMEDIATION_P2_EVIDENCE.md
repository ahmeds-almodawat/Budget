# P2 Financial Transaction Remediation Evidence

**Branch:** `fix/audit-p2-financial-transactions`  
**Base:** `fix/audit-p0-authorization`  
**Date:** 2026-08-06

## Migrations added

| Migration | Scope |
|-----------|-------|
| `20260806040000_p2_command_framework_audit.sql` | Idempotency ledger, audit extensions, append-only triggers |
| `20260806040100_p2_budget_state_machine.sql` | Budget transitions, immutability, change approval |
| `20260806040200_p2_import_actuals_reversals.sql` | Import posting, actual posting, reversals |
| `20260806040300_p2_progress_schedule.sql` | Progress/schedule commands, baseline versions |

Total migrations after remediation: **26** (17 baseline + 9 P2).

## Public RPC surface

`rpc_budget_submit`, `rpc_budget_start_review`, `rpc_budget_reject`, `rpc_budget_approve_and_lock`, `rpc_budget_supersede`, `rpc_budget_approve_change_request`, `rpc_import_review_batch`, `rpc_import_post_batch`, `rpc_post_actual_transaction`, `rpc_reverse_actual_transaction`, `rpc_submit_progress`, `rpc_verify_progress`, `rpc_accept_milestone`, `rpc_schedule_approve_extension`

## TypeScript command layer

`src/lib/commands/index.ts` wraps all RPCs with typed error mapping.

## Test artifacts

- `src/lib/commands/commands.test.ts` — unit
- `scripts/run-db-tests.mjs` — extended DB invariants (COD-H-003, COD-H-004)
- `scripts/run-concurrency-tests.mjs` — idempotency and cross-tenant probes

## Verification record (2026-08-06, branch head)

| Check | Result |
|-------|--------|
| npm ci | PASS |
| supabase db reset --no-seed | PASS (26 migrations) |
| db:fixtures:local (14 personas) | PASS |
| lint | PASS (warnings only) |
| typecheck | PASS |
| vitest | 31/31 |
| test:db | 23/23 |
| concurrency script | 4/4 |
| e2e (CI=true, retries=0) | 17/17 |
| build | PASS |
