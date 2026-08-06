# P2 Remediation Traceability

| Finding | Remediation | Test |
|---------|-------------|------|
| COD-H-003 | Audit extensions, append-only triggers, command-only writes | `audit_events are append-only` DB test |
| COD-H-004 | Approved immutability triggers on header/lines/months | `approved budget version amounts are immutable` |
| COD-H-005 | `budget_transition` + `rpc_budget_approve_and_lock`, partial unique index | Hospital integration test, concurrency |
| COD-H-006 | `rpc_budget_approve_change_request` (request ID only) | Budget change integration (pending) |
| COD-H-007 | `rpc_import_post_batch` atomic + SOD | Import action uses approve permission |
| COD-H-009 | Draft posting, exact reconciliation RPC | `rpc_post_actual_transaction` |
| COD-H-010 | Idempotent `rpc_reverse_actual_transaction`, unique index | Concurrency reversal test |
| COD-H-012 | Progress/schedule command RPCs | Project schedule integration test |
| COD-M-002 | Repository joins via `import_batches` | Exception queue queries |
| COD-M-005 | Cross-tenant allocation trigger | Concurrency cross-tenant test |
| COD-M-006 | `schedule_baseline_versions` table | Schedule approve command |
| COD-M-008 | DB + concurrency + command unit tests | `npm run test`, `test:db`, concurrency script |

**Out of scope (not authorized):** COD-H-008, COD-H-011, COD-H-013, COD-H-014
