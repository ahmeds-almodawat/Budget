# Security Review

## Implemented

- RLS enabled and forced on all 54 public tables (deny by default) — **84 reviewed policies**
- Canonical active-profile, active-membership, legal-entity, effective-role, and hierarchical-scope helpers in `private`
- Empty `search_path`; exact authenticated execute grants only on the five authorization helpers
- Explicit operation grants for authenticated; no business-object grants for anon, PUBLIC, or service-role
- Three tenant-filtered `security_invoker` views
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

- Generated privilege/policy evidence must be reviewed when any public object changes
- JWT role claims must use app metadata, not user metadata
- Parallel E2E under heavy load may flake without single-worker config
