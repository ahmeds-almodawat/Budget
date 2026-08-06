# Forecast Control Model (P4)

## State graph

```
draft ──submit──► submitted ──review──► under_review ──approve──► approved ──lock──► locked
  │                  │                      │                         │
  cancel             reject/cancel          reject/cancel             supersede
  ▼                  ▼                      ▼                         ▼
cancelled          rejected/cancelled     rejected/cancelled        superseded
```

## Uniqueness grain (current approved)

One `is_current_approved = true` row per:

- `legal_entity_id`
- `control_scope_id`
- `fiscal_year_id`
- `scenario`
- `COALESCE(project_id, zero-uuid)`
- `COALESCE(control_account_id, zero-uuid)`

## Transactional commands

| Command | RPC |
|---------|-----|
| Create draft | `rpc_forecast_create_draft` |
| Update draft | `rpc_forecast_update_draft` |
| Submit | `rpc_forecast_submit` |
| Begin review | `rpc_forecast_start_review` |
| Reject | `rpc_forecast_reject` |
| Cancel | `rpc_forecast_cancel` |
| Approve + lock | `rpc_forecast_approve_and_lock` |
| Supersede | `rpc_forecast_supersede` |

## Immutability

- Approved/locked/superseded version headers: financial metadata immutable
- Forecast lines: mutable only while parent version is `draft`

## Segregation of duties

- Submitter cannot approve (`SOD_VIOLATION`)
- Draft edit restricted to owner or controller roles
