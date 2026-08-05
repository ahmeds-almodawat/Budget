# Permission Matrix (Summary)

Roles defined in `src/domain/auth/permissions.ts`:

| Role | Typical scope | Write | Approve |
|------|---------------|-------|---------|
| System Administrator | Group | All | All |
| Auditor | Entity | Read only | No |
| Viewer | Entity | Read only | No |
| Budget Owner | Budget | Budget draft | No (segregation) |
| Approver | Entity/Scope | Read | Yes |
| Finance User | Entity | Import/allocate actuals | No |
| Project Manager | Project | Project/WBS | No budget approval |
| Employee | Task | Own tasks | Cannot approve own progress |

Database RLS enforces legal-entity isolation via `memberships` and `user_legal_entity_ids()`.

See [PERMISSION_MATRIX.md](./PERMISSION_MATRIX.md) for full matrix.
