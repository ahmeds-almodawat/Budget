# Security Review

## Implemented

- RLS enabled on core tenant tables (deny by default)
- `user_legal_entity_ids()` scoped access
- Posted actuals: UPDATE/DELETE denied via RLS
- Permission domain with auditor/viewer read-only
- Segregation: employee cannot approve own progress (domain + DB CHECK)
- No secrets in repository (`.env.example` only)
- SECURITY DEFINER functions use explicit `search_path`

## Pending

- Complete RLS for all tables listed in migrations
- Supabase Auth login flow and session middleware chaining
- Storage bucket policies for evidence attachments
- Negative RLS integration tests against live Supabase

## Risks

- Views (`v_budget_vs_actual`) need `security_invoker` when exposed via API
- JWT role claims must use app metadata, not user metadata
