# Financial Transaction State Machines

P2 remediation introduces database-enforced state machines for regulated financial workflows.

## Budget versions

| From | To | Command |
|------|-----|---------|
| draft | submitted | `rpc_budget_submit` |
| submitted | under_review | `rpc_budget_start_review` |
| submitted / under_review | rejected | `rpc_budget_reject` |
| under_review | approved + locked | `rpc_budget_approve_and_lock` |
| locked / posted | superseded | `rpc_budget_supersede` |

Constraints:
- One `is_current_approved` per legal entity + control scope + fiscal year (partial unique index)
- Approved/locked header amounts, lines, and monthly allocations are immutable
- Self-approval denied at command layer

## Import batches

| From | To | Command | Segregation |
|------|-----|---------|-------------|
| submitted | under_review | `rpc_import_review_batch` | Reviewer ≠ importer |
| under_review | posted | `rpc_import_post_batch` | Poster ≠ importer |

Posting is atomic: all rows, allocations, queues, and batch status commit or roll back together.

## Actual transactions

| State | Meaning |
|-------|---------|
| `is_posted = false` | Draft / validated, not in reports |
| `is_posted = true` | Posted; immutable except governed reversal |

Commands:
- `rpc_post_actual_transaction` — requires exact allocation reconciliation
- `rpc_reverse_actual_transaction` — idempotent; one reversal per original

## Progress and schedule

| Workflow | Command |
|----------|---------|
| Submit progress | `rpc_submit_progress` |
| Verify progress | `rpc_verify_progress` |
| Accept milestone | `rpc_accept_milestone` |
| Approve schedule extension | `rpc_schedule_approve_extension` |

Progress must be 0–100. Verification requires submitted status and SOD (reporter ≠ verifier).
