# Known Limitations

1. **Production auth** — Local Supabase Auth is wired; production IdP/OAuth not configured. Known-password seed users exist only in local dev migrations (see `docs/LOCAL_SETUP.md` § Authentication seed boundary).

2. **Scaffold modules** — `cost-control`, `forecasts`, `performance`, `administration`, `master-data` remain placeholders.

3. **Delegated approvals** — Approvals inbox includes a delegated tab; delegation records are not yet wired.

4. **Procurement documents** — Contracts, invoices, payments, and credit notes tabs are scaffolded; commitments and vendors are populated.

5. **RLS coverage** — **75** policies applied; not every table/role combination is exhaustively tested.

6. **pgTAP** — SQL test placeholder remains; executable tests use `scripts/run-db-tests.mjs`.

7. **Service role** — Retained server-only for future admin tooling; not used in user workflow paths.

8. **Windows build intermittency** — Next.js production build may fail with worker exit `3221226505` on memory-constrained Windows hosts. Classified as **resource/environment limitation**, not a reproducible application defect. Linux CI is authoritative.

9. **Supabase local reset intermittency** — `supabase db reset` may return HTTP 502 during container restart under load; retry after `supabase stop` / `supabase start` succeeds.

10. **CI evidence** — `composer-review-ready-v1` tag is applied only after GitHub Actions CI passes on the review-preparation commit.
