# Dependency Security Review (P4)

**Date:** 2026-08-06  
**Branch:** `fix/audit-p4-localization-forecast-rpc`

## Production dependency inventory

Direct production dependencies (from `package.json`): Next.js 16.3, React 19, Supabase SSR/JS, next-intl, exceljs 4.4, papaparse, decimal.js, zod, Radix UI primitives, date-fns, recharts, TanStack Table.

Transitive exposure of note: `uuid` (via `exceljs`), various `@radix-ui/*` peers, `@supabase/*` auth helpers.

## npm audit result

```
2 moderate severity vulnerabilities
uuid <11.1.1 (GHSA-w5hq-g745-h8pq) — missing buffer bounds check in v3/v5/v6
  └── exceljs >=3.5.0
```

## exceljs / uuid assessment

| Item | Detail |
|------|--------|
| **Finding** | Transitive `uuid` in exceljs dependency tree |
| **Usage path** | Server-side report export only (`src/app/actions/report-actions.ts` → Excel workbook generation) |
| **Exploitability** | Low — attacker does not supply uuid buffers; export is authenticated and permission-gated (`report/export`) |
| **Compensating controls** | No user-controlled uuid parsing; export size limits; authenticated session; RLS on underlying data |
| **Accepted risk owner** | Platform engineering / security review |
| **Upgrade path** | Monitor exceljs releases for uuid bump; evaluate `exceljs@3.4.0` only if export API verified (audit fix is breaking) |
| **Automatic major upgrade** | **Not performed** — `npm audit fix --force` would downgrade exceljs to 3.4.0 (breaking API) without regression coverage on export |

## Removed risks

- `xlsx` removed from production dependencies (P3) — eliminates prior high-severity sheetjs advisories.

## CI dependency-security gate

- `npm audit` runs in CI workflow (moderate+ reported; build not blocked on moderate transitive uuid while compensating controls documented).
- Import security matrix (`npm run test:import-security`) covers CSV attack surface separately.

## Recommendation

Schedule exceljs upgrade when maintainers release version bundling `uuid@>=11.1.1`. Re-run export E2E and `npm audit` before production promotion.
