# P4 Remediation Traceability

**Branch:** `fix/audit-p4-localization-forecast-rpc`  
**Stacked PR:** targeting `fix/audit-p3-reporting-ingress`

## Finding → control → evidence

| Area | Control | Evidence |
|------|---------|----------|
| Forecast workflow | Transactional RPC state machine | `20260806110000_p4_forecast_state_machine.sql` |
| COD-M-010 | Translation parity script | `scripts/check-translations.mjs` |
| COD-H-008 | Import security matrix | `secure-csv.security.test.ts` |
| COD-L-001 | Proxy migration | `src/proxy.ts` |
| Two-entity auth | Server-action matrix | `docs/SERVER_ACTION_SECURITY_MATRIX.md` |

## Migration count

29 migrations (adds `20260806110000_p4_forecast_state_machine.sql`)

## Public RPC count

22 (14 P2/P3 + 8 forecast)
