# Delegated Approvals Model (P5)

## Purpose

Separate absence substitution from authority delegation; record both acting delegate and original authority on every delegated decision.

## Delegation record

| Field | Required |
|-------|----------|
| delegator | yes |
| delegate | yes |
| legal_entity | yes |
| business_unit | optional |
| project/control scope | optional |
| workflow_type | yes |
| permission / approval authority | yes |
| financial_threshold | optional |
| effective_start / effective_end | yes |
| reason | yes |
| status | yes |

## State graph

```
draft → submitted → approved → active → expired
```

Also: `rejected`, `revoked`, `cancelled`

## Rules enforced in database

- No self-delegation
- No circular delegation (graph walk, max depth configurable)
- Delegate authority ⊆ delegator authority
- Entity scope cannot widen; project scope cannot become entity-wide
- Threshold cannot exceed delegator threshold
- Expired / future-dated delegations ineffective
- Revocation immediate
- Delegate cannot approve own original request (SOD)
- Delegated decisions store `acting_delegate_id` and `authority_holder_id`

## Commands

- `rpc_delegation_create_draft`
- `rpc_delegation_submit`
- `rpc_delegation_approve`
- `rpc_delegation_revoke`
- `rpc_delegation_cancel`
