# First-attempt E2E test guide

Use only the isolated local Supabase project on ports `56000–56009`.

```powershell
npm ci
npx supabase start
npm run db:wait-local
npx supabase db reset --no-seed
npm run db:wait-local
node scripts/assert-production-migrations-safe.mjs
node scripts/sync-local-env.cjs
$env:ALLOW_LOCAL_FIXTURES='true'
npm run db:fixtures:local
Remove-Item Env:ALLOW_LOCAL_FIXTURES
npm run test:e2e
```

Playwright runs one worker with `retries: 0`. A failed run remains a failed
first attempt; reruns may diagnose a correction but must never be reported as
equivalent stability evidence. The Windows readiness gate is service
orchestration, not a test rerun.
