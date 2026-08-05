# Known Limitations

1. **Production auth** — Local Supabase Auth is wired; production IdP/OAuth not configured.
2. **Scaffold modules** — Several nav routes are descriptive placeholders without workflows.
3. **Restaurant KPIs** — Branch list is database-backed; food/labor percentages require mapped revenue/cost actuals.
4. **RLS coverage** — 49 policies applied; not every table/role combination is exhaustively tested.
5. **Approval queues** — Budget/import approvals execute in DB but lack dedicated queue UI.
6. **Report export** — Import CSV template only; operational report Excel export not implemented.
7. **pgTAP** — SQL test placeholder remains; executable tests use `scripts/run-db-tests.mjs`.
8. **Service role** — Retained server-only for future admin tooling; not used in user workflow paths.
