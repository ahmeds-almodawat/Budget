# Test Strategy

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest | `src/**/*.test.ts` |
| Integration | Vitest + Supabase Auth | `src/domain/integration/*.test.ts` |
| E2E | Playwright (real Auth, no mocking) | `e2e/` |
| Database | Node/pg scripts | `scripts/run-db-tests.mjs` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

## Current counts (feature branch @ `ca51c4e`)

| Suite | Files / tests | Last local run (2026-08-05) |
|-------|---------------|------------------------------|
| Vitest | 6 files, **26 tests** | 26 pass, 0 fail, 0 skip |
| Database | **15 tests** | 15 pass |
| Playwright E2E | **17 tests** (`auth-workflows` 10, `bilingual-navigation` 5, `project-workflows` 2) | 17 pass (single complete execution) |

## Auth test coverage

- **E2E:** sign-in redirect, budget workflow, self-approval denial, finance imports, auditor read-only, Arabic RTL, sign-out, project progress paths
- **Integration:** authenticated budget workflow; viewer write denial; project progress (where present)
- **DB:** integrity triggers, baseline immutability, self-verify denial, RLS role matrix

## CI workflow

Runs on `pull_request` → `main`, `push` to `feature/enterprise-control-platform`, and `workflow_dispatch`:

1. `npm ci` (Node 20)
2. `supabase start` + `supabase db reset`
3. `node scripts/sync-local-env.cjs` (secrets written to `.env.local` only, not logged)
4. `npm run lint`, `typecheck`, `test`, `test:db`, `test:e2e`, `build`
5. Playwright report artifact on failure

Local test password is created deterministically in seed migrations — not stored as a GitHub secret.

## Commands

```bash
supabase start
supabase db reset
node scripts/sync-local-env.cjs
npm run test
npm run test:db
npm run test:e2e
npm run verify
node scripts/count-rls-policies.cjs   # optional RLS count
```

## Local test users

See [AUTHENTICATION_AND_AUTHORIZATION.md](./AUTHENTICATION_AND_AUTHORIZATION.md). Fixtures: `src/test/fixtures/users.ts` (tests only).
