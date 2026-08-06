# P2 Remediation Traceability

**Branch:** `fix/audit-p2-financial-transactions`  
**Catalog:** 55 public tables, 55 forced RLS, 85 `authenticated` policies, 14 public RPCs, 37 private functions, 26 migrations.

| Finding | Remediation | Test |
|---------|-------------|------|
| COD-H-003 | Audit extensions, append-only triggers, command-only writes | `audit_events are append-only` DB test |
| COD-H-004 | Approved immutability triggers on header/lines/months | `approved budget version amounts are immutable` |
| COD-H-005 | `budget_transition` + `rpc_budget_approve_and_lock`, partial unique index | Hospital integration test, concurrency |
| COD-H-006 | `rpc_budget_approve_change_request` (request ID only) | Budget change integration (**pending** — P3) |
| COD-H-007 | `rpc_import_post_batch` atomic + SOD | Import action uses approve permission |
| COD-H-009 | Draft posting, exact reconciliation RPC | `rpc_post_actual_transaction` |
| COD-H-010 | Idempotent `rpc_reverse_actual_transaction`, unique index | Concurrency reversal test |
| COD-H-012 | Progress/schedule command RPCs | Project schedule integration test |
| COD-M-002 | Repository joins via `import_batches` | Exception queue queries |
| COD-M-005 | Cross-tenant allocation trigger | Concurrency cross-tenant test |
| COD-M-006 | `schedule_baseline_versions` table | Schedule approve command |
| COD-M-008 | DB + concurrency + command unit tests | 31 Vitest + 23 DB + 4 concurrency |

**Deferred to P3 (not in P2 scope):** COD-H-008, COD-H-011, COD-H-013, COD-M-004, COD-M-007, COD-M-010, COD-L-001, COD-L-002.

**COD-H-014:** Addressed when CI runs on PR #3 at exact head — see `REMEDIATION_P2_EVIDENCE.md` for run URL.

## CI evidence

| Item | Value |
|------|-------|
| PR | [#3](https://github.com/ahmeds-almodawat/Budget/pull/3) |
| Exact-head SHA | _pending first green run_ |
| Run URL | _pending_ |
