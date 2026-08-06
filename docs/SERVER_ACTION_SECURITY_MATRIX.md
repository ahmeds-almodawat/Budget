# Server Action Security Matrix

Generated inventory of server actions for two-entity regression coverage.

| Action | File | Permission | Reads | Writes | Transactional RPC |
|--------|------|------------|-------|--------|-------------------|
| fetchForecastsAction | forecast-actions.ts | budget/read | yes | no | — |
| createForecastDraftAction | forecast-actions.ts | budget/create | no | yes | rpc_forecast_create_draft |
| updateForecastDraftAction | forecast-actions.ts | budget/update | no | yes | rpc_forecast_update_draft |
| submitForecastAction | forecast-actions.ts | budget/update | no | yes | rpc_forecast_submit |
| startForecastReviewAction | forecast-actions.ts | budget/update | no | yes | rpc_forecast_start_review |
| approveForecastAction | forecast-actions.ts | budget/approve | no | yes | rpc_forecast_approve_and_lock |
| rejectForecastAction | forecast-actions.ts | budget/approve | no | yes | rpc_forecast_reject |
| cancelForecastAction | forecast-actions.ts | budget/update | no | yes | rpc_forecast_cancel |
| parseImportFileAction | import-actions.ts | actual/import | no | yes | — (quarantine) |
| postImportBatchAction | import-actions.ts | actual/approve | no | yes | rpc_import_post_batch |
| approveBudgetChangeRequest | budget-actions.ts | budget/approve | no | yes | rpc_budget_approve_change_request |
| setActiveLegalEntityAction | context-actions.ts | — | no | yes | cookie only |

Full manifest: 59 actions across 12 files. Two-entity integration tests cover forecast, budget change, and import paths.

## Cross-tenant test cases

1. Entity A user on Entity A resource — allow
2. Entity A user on Entity B resource — deny (FORBIDDEN)
3. Cookie tampering to unauthorized entity — deny
4. No membership — deny (NO_MEMBERSHIP)
5. Inactive / expired / future role — deny

## Public error policy

All actions use `toPublicDataAccessError` — no SQLSTATE, table names, or stack traces in client responses.
