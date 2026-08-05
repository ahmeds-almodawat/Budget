# Data Dictionary (Core Entities)

| Table | Description |
|-------|-------------|
| `organizations` | Top-level tenant group |
| `legal_entities` | Legal company with currency/timezone/FY settings |
| `organization_units` | OBS nodes with parent-child and effective dates |
| `control_scopes` | Universal planning/control object |
| `projects` | WBS root linked to control scope |
| `cost_nodes` | CBS hierarchy (category/subcategory/item) |
| `control_accounts` | Measurement node linking scope, org, cost |
| `budget_versions` | Immutable-approved budget containers |
| `budget_lines` | Driver-based or amount lines |
| `actual_transactions` | Imported ERP transactions (source preserved) |
| `actual_transaction_allocations` | Multi-dimensional splits |
| `commitments` | Open commitment tracking |
| `milestones` | Schedule checkpoints with progress methods |
| `audit_events` | Append-only audit trail |

Full column definitions: see migration SQL files.
