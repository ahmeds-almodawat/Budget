# Known Limitations

1. **Auth UI** — Server actions use seeded local actor UUIDs; Supabase Auth login page not wired.
2. **Scaffold modules** — Several nav routes are descriptive placeholders without workflows.
3. **Restaurant KPIs** — Branch list is database-backed; food/labor percentages require mapped revenue/cost actuals.
4. **RLS coverage** — Foundation policies exist; not every table/role combination is tested.
5. **Approval queues** — Budget/import approvals execute in DB but lack dedicated queue UI.
6. **Report export** — Import CSV template only; operational report Excel export not implemented.
7. **pgTAP** — SQL test placeholder remains; executable tests use `scripts/run-db-tests.mjs`.
