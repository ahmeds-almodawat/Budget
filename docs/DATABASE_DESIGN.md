# Database Design

Migrations in `supabase/migrations/` (ordered):

| Migration | Content |
|-----------|---------|
| `20260805120000_extensions_and_organization.sql` | Enums, organizations, legal entities, OBS |
| `20260805120100_auth_and_audit.sql` | Profiles, roles, memberships, audit |
| `20260805120200_control_scopes_projects_wbs.sql` | Control scopes, projects, phases, tasks, milestones |
| `20260805120300_cost_structure_budgets.sql` | Cost nodes, GL mappings, control accounts, budgets |
| `20260805120400_actuals_commitments_forecasts.sql` | Vendors, imports, actuals, commitments, forecasts |
| `20260805120500_rls_policies.sql` | RLS enablement and foundation policies |

## Conventions

- UUID primary keys
- `NUMERIC(18,4)` for money, rates, quantities
- Legal-entity scoping on tenant tables
- No hard delete on posted financial records
- Append-only audit_events

See [DATA_DICTIONARY.md](./DATA_DICTIONARY.md).
