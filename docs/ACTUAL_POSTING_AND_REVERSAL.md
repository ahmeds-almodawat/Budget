# Actual Posting and Reversal

## Posting

Actuals default to `is_posted = false`. Posting requires:

1. Caller has finance/cost-controller role for the legal entity
2. Allocations exist and `SUM(allocation_amount) = amount_ex_vat` (exact, ±0.0001)
3. All allocation dimensions share the transaction legal entity (cross-tenant trigger)

`rpc_post_actual_transaction` sets `is_posted = true` and writes an audit event atomically.

## Reversal

`rpc_reverse_actual_transaction`:

- Accepts original transaction ID, reason, idempotency key
- Creates negated header and mirrored allocations
- Enforces one reversal per original (`idx_actual_one_reversal`)
- Returns existing reversal on idempotent replay
- Uses audit action `reverse` (not `update`)

## Immutability

Posted actuals cannot be updated or deleted (trigger `trg_actual_posted_immutable`).
