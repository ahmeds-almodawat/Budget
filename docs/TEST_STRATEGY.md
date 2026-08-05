# Test Strategy

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest | `src/**/*.test.ts` |
| Component | RTL | Planned for forms/tables |
| E2E | Playwright | `e2e/` |
| Database | Supabase pgTAP/SQL | `supabase/tests/` |

## Covered unit tests

- Financial formulas (EV, EAC, VAT, variance thresholds)
- Money allocation reconciliation
- Permission and segregation rules

## Commands

```bash
npm run test
npm run test:e2e
npm run verify
```
