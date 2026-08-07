# Test Strategy

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest | `src/**/*.test.ts` |
| Integration | Vitest + Supabase Auth | `src/domain/integration/*.test.ts` |
| E2E | Playwright (real Auth, no mocking) | `e2e/` |
| Database | Node/pg scripts | `scripts/run-db-tests.mjs` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

## Current remediation evidence (final local clean run)

| Suite | Files / tests | Last local run (2026-08-05) |
|-------|---------------|------------------------------|
| Vitest | 6 files, **29 tests** | 29 pass, 0 fail, 0 skip |
| Database | **22 tests** | 22 pass; emits privilege/policy artifact |
| Playwright E2E | **17 tests** | 17 pass on first attempt; retries disabled |

## Auth test coverage

- **E2E:** sign-in redirect, budget workflow, self-approval denial, finance imports, auditor read-only, Arabic RTL, sign-out, project progress paths
- **Integration:** authenticated budget workflow; viewer write denial; project progress (where present)
- **DB:** all 54 table classifications; all three views; exact grants for anon/authenticated/service-role; all 84 policies; function ACL/search-path/security mode; tenant isolation; inactive/future/expired/no-membership/group/entity/project personas; representative allowed/denied writes

## CI workflow

Runs on pull requests to `main` or `feature/enterprise-control-platform`, pushes
to `feature/enterprise-control-platform`, and manual dispatch:

1. `npm ci` (Node `22.18.0`) and Supabase CLI `2.111.0`
2. start and readiness gate
3. `supabase db reset --no-seed`, readiness gate, migration-safety scan, and zero-Auth-user assertion
4. explicit guarded local persona fixture
5. lint, typecheck, unit/integration, DB, E2E, and build—once, with no retries
6. authorization matrix always; Playwright report on failure

The local password exists only in the guarded fixture and test fixture files; it
is not a GitHub secret and is never installed by production migrations.

## Commands

```bash
supabase start
npx supabase db reset --no-seed
npm run db:wait-local
node scripts/assert-production-migrations-safe.mjs
node scripts/sync-local-env.cjs
$env:ALLOW_LOCAL_FIXTURES='true'
npm run db:fixtures:local
npm run test
npm run test:db
npm run test:e2e
npm run verify
node scripts/count-rls-policies.cjs   # optional RLS count
```

## Local test users

See [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md). Fixtures: `src/test/fixtures/users.ts` (tests only).
