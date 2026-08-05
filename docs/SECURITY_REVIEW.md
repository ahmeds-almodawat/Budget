# Security Review

## Implemented

- RLS enabled on core tenant tables (deny by default) — **49 policies**
- `user_legal_entity_ids()` scoped access with restricted EXECUTE to `authenticated`
- `user_has_role()` with explicit `search_path` and restricted EXECUTE
- Posted actuals: UPDATE/DELETE denied via RLS
- Permission domain with auditor/viewer read-only
- Segregation: employee cannot approve own progress (domain + DB CHECK)
- No secrets in repository (`.env.example` only)
- **Supabase Auth** cookie sessions with middleware protection
- Server actions derive actor from session — no hardcoded runtime UUIDs
- Self-approval denied for budget submitter (server + DB `submitted_by`)

## Pending

- Storage bucket policies for evidence attachments
- Production OAuth/SSO provider configuration
- Full pgTAP suite via `supabase test db`

## Risks

- Views (`v_budget_vs_actual`) need `security_invoker` when exposed via API (already set)
- JWT role claims must use app metadata, not user metadata
- Parallel E2E under heavy load may flake without single-worker config
