# Financial Rules

Implemented in `src/domain/financial/calculations.ts` with unit tests.

| Formula | Definition |
|---------|------------|
| Current Approved Budget | Original + Increases − Reductions |
| Open Commitment | Committed − Invoiced Applied − Cancelled |
| EAC | Actual + Open Commitments + Forecast Uncommitted |
| Available Budget | Current Approved − Actual − Open Commitments |
| CV | EV − AC |
| SV | EV − PV |
| CPI | EV / AC (null if AC = 0) |
| SPI | EV / PV (null if PV = 0) |
| Driver budget | Quantity × Unit Rate |
| Risk exposure | Probability × Financial Impact |

All calculations use Decimal.js; display SAR to 2 decimal places.
