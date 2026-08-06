# Period Close Control Model (P5)

## Period states

```
future → open → soft_close → hard_close
```

Also: `reopened`, `archived`

## Module-specific close flags

Separate status per: budgets, actuals, procurement, projects, forecasts, reporting.

## Soft close

- Blocks ordinary posting
- Allows defined closing roles with documented exceptions

## Hard close

- Blocks all ordinary changes
- Fails while configured checklist blockers remain

## Checklist blockers (configurable)

- Unmapped actuals
- Unposted import batches
- Unreconciled allocations
- Unmatched invoices
- Unapproved receipts
- Open matching exceptions
- Pending budget changes
- Open forecast submissions
- Overdue variance explanations
- Unresolved high risks
- Pending approvals

## Reopen

Requires senior role, reason, scope, start/expiry, approval, impacted records, audit event.

## Commands

- `rpc_period_soft_close`
- `rpc_period_hard_close`
- `rpc_period_reopen_request`
- `rpc_period_reopen_approve`

Posting commands call `private.assert_period_open(module, legal_entity, fiscal_period_id)`.
