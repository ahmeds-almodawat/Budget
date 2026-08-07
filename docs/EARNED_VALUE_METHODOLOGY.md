# Earned Value Methodology (COD-H-011)

## Source view

`v_project_earned_value` — security-invoker, tenant-filtered via `user_can_access_legal_entity`.

## Definitions

| Metric | Definition |
|--------|------------|
| **BAC** | Sum of current approved budget lines for the control account |
| **PV** | Time-phased monthly budget allocated through periods ending on or before status date |
| **EV** | BAC × verified milestone progress % (latest verified update per milestone) |
| **AC** | Posted actual allocations to the control account (signed, includes reversals) |

## Progress inputs

Only progress with:

- `verification_status = 'verified'`
- `approval_status = 'approved'`
- `verified_by IS NOT NULL`

Physical progress is not derived from money spent.

## Derived indices (application layer)

Calculated with Decimal end-to-end in `src/domain/financial/calculations.ts`:

- CV = EV − AC
- SV = EV − PV
- CPI = EV / AC (when AC > 0)
- SPI = EV / PV (when PV > 0)
- EAC = BAC / CPI (when CPI > 0; labeled methodology)
- ETC = EAC − AC
- VAC = BAC − EAC

## Insufficient data

When required inputs are absent (e.g. zero PV, no verified progress), the UI displays **insufficient data** rather than demonstration constants.

## Removed anti-patterns

Runtime code no longer uses hardcoded multipliers such as `PV = BAC × 45%` or `EV = BAC × 35%`.
