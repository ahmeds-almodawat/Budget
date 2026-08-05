# Test Strategy

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest | `src/**/*.test.ts` |
| Integration | Vitest + Supabase Auth | `src/domain/integration/*.test.ts` |
| E2E | Playwright (real Auth, no mocking) | `e2e/` |
| Database | Node/pg scripts | `scripts/run-db-tests.mjs` |

## Auth test coverage

- **E2E (15):** sign-in redirect, budget owner draft/submit, multi-user approve flow, self-approval denial, finance imports, auditor read-only, Arabic RTL auth, sign-out protection, dashboards
- **Integration (2):** authenticated budget workflow; viewer write denial
- **DB (14):** integrity triggers + RLS for auditor/viewer/no-membership/cross-entity

## Local test users

See [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md). Fixtures: `src/test/fixtures/users.ts` (tests only).

## Commands

```bash
npm run test
npm run test:db
npm run test:e2e
npm run verify
```
