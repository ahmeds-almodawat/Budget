# Transactional Audit Model

## Schema extensions (`audit_events`)

| Column | Purpose |
|--------|---------|
| `legal_entity_id` | Tenant scope |
| `control_scope_id` | Control scope scope |
| `project_id` | Project scope |
| `correlation_id` | Cross-command trace |
| `idempotency_key` | Command deduplication |
| `previous_value` / `new_value` | Before/after JSON state |

## Write path

- Clients cannot INSERT into `audit_events` (server-only table, no authenticated grant)
- Commands call `private.write_audit_event` inside the same transaction
- `trg_audit_events_deny_update` / `trg_audit_events_deny_delete` enforce append-only storage

## Actor integrity

`actor_id` is always `(SELECT auth.uid())` inside SECURITY DEFINER commands — never caller-supplied.

## Covered workflows

Budget transitions, change approvals, import posting, actual posting/reversal, progress verification, schedule extension approval.
