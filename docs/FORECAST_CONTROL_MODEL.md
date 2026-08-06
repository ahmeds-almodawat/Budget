# Forecast Control Model

## Status

**Partially implemented** on `fix/audit-p3-reporting-ingress`.

## Schema

`forecast_versions` extended with workflow columns mirroring budget versions:

- `is_current_approved`, `submitted_at/by`, `reviewed_at/by`, `approved_at/by`, `locked_at`
- Unique partial index: one current approved forecast per legal entity + control scope

## Workflow (application layer)

| Step | Actor | Status transition |
|------|-------|-------------------|
| Create draft | Forecast owner | `draft` |
| Submit | Owner | `submitted` |
| Approve | Separate approver | `approved` / `locked` |
| Supersede | System on new approval | prior → `superseded` |

Actions: `src/app/actions/forecast-actions.ts`  
UI: `src/app/[locale]/forecasts/page.tsx`

## Relationship to reporting

- Hospital forecast extension in `v_hospital_period_performance`: `full_year_forecast = ytd_actual + remaining_budget`
- Governed forecast versions are the target for future report integration

## Limitations

- No P2-style transactional RPC commands yet (app-layer with RLS)
- Monthly forecast line entry is basic; full assumption/quantity/rate model pending
- Comparison with budget and actuals is read-only from reporting views

## Future work

- Transactional submit/approve RPCs with audit events
- Forecast line grain matching `REPORTING_GRAIN_AND_LINEAGE.md`
- Approved forecast selection in hospital and project reports
