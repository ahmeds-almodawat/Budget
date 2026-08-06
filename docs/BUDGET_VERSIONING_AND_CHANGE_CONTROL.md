# Budget Versioning and Change Control

## Version lineage

Approved budgets are immutable. Changes flow through `budget_change_requests` and produce a new locked version via `rpc_budget_approve_change_request`.

The command:
1. Locks the change request row
2. Validates submitted status and SOD
3. Clones all lines and proportional monthly allocations from the source version
4. Applies deltas from `budget_change_lines` server-side
5. Supersedes the prior current version
6. Writes an authoritative audit event

## Client contract

Approvers pass only:
- `change_request_id`
- `expected_status` (default `submitted`)
- `idempotency_key`

Client-supplied budget line IDs, version IDs, and amounts are rejected by design.

## Invariants

- Header `original_approved_amount` equals sum of line `planned_amount` on approval
- Monthly allocations reconcile to line totals (proportional spread on change)
- At most one `is_current_approved` budget per scope and fiscal year
