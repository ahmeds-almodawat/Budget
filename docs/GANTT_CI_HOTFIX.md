# Gantt CI hotfix evidence

## Authoritative fixture

After `supabase db reset --no-seed` and the guarded local fixture loader, the
`Foundation Completed and Approved` schedule record is:

- Source: `public.milestones`
- ID: `ffffffff-ffff-ffff-ffff-ffffffffff01`
- Code: `MS-FOUNDATION`
- Baseline date: `2027-08-30`
- Forecast date: `2027-09-15`
- Approved and reported progress: `65%`
- Approval status: `approved`

The focused Gantt suite renders and asserts that authoritative 65% value.

## CI order dependency

`src/domain/integration/project-schedule.integration.test.ts` submits 72% and
verifies 70% for the same shared milestone. Before this hotfix, the test left
the generated `milestone_progress_updates` row and the 70% milestone value in
the database. GitHub Actions runs `npm run test` before `npm run test:e2e`, so
the Gantt assertion received 70% even though the fixture starts at 65%.

No earlier E2E test mutates this record. In the one-worker order, the Gantt
suite runs as tests 57–61 and the only E2E workflow that updates this milestone
runs afterward as test 62.

The integration test now snapshots and restores the progress fields and removes
its generated update. The Gantt suite also restores and verifies its dedicated
authoritative fixture in `beforeAll`, so it remains deterministic if another
test changes shared state in the future.

## Duplicate React keys

The warnings were not emitted by Gantt. They reproduce when the cost-control
profitability tab renders rows produced for more than one control scope in the
same fiscal period. `BudgetVsActualWorkspace` keyed those siblings only by
`fiscal_period_id`, so a period UUID appeared more than once. The row key now
uses the stable composite identity `control_scope_id + fiscal_period_id`.

This is presentation identity only. The hotfix does not change migrations,
SQL, RLS, RPCs, grants, financial or EVM formulas, schedule state machines, or
approval logic.
