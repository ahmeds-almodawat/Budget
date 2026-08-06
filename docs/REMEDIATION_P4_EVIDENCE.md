# P4 Remediation Evidence

**Branch:** `fix/audit-p4-localization-forecast-rpc`  
**Base:** `fix/audit-p3-reporting-ingress`  
**Date:** 2026-08-06

## P3 exact-head evidence (prerequisite)

| Field | Value |
|-------|-------|
| SHA | `44c4aa01281eafd38e5c8d1aadc588b33e0b49c2` |
| CI URL | https://github.com/ahmeds-almodawat/Budget/actions/runs/31080104021 |
| Result | success |

## P4 scope

- Transactional forecast state machine (8 RPCs)
- Forecast workspace UI (draft → submit → review → approve)
- Import security test matrix
- Translation completeness script
- Next.js `middleware.ts` → `proxy.ts` migration
- Server-action security matrix (in progress)

## Forecast RPCs

| RPC | Purpose |
|-----|---------|
| `rpc_forecast_create_draft` | Atomic draft + lines |
| `rpc_forecast_update_draft` | Draft edit with row version |
| `rpc_forecast_submit` | draft → submitted |
| `rpc_forecast_start_review` | submitted → under_review |
| `rpc_forecast_reject` | under_review → rejected |
| `rpc_forecast_cancel` | draft/submitted → cancelled |
| `rpc_forecast_approve_and_lock` | under_review → approved → locked |
| `rpc_forecast_supersede` | locked → superseded |

## CI evidence

| Field | Value |
|-------|-------|
| Exact head SHA | `befacab28fd304bd8158d1069ad33409627c9b9e` |
| Run URL | https://github.com/ahmeds-almodawat/Budget/actions/runs/31082908511 |
| Result | **success** (first attempt at head) |
