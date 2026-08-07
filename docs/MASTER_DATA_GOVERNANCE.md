# Master Data Governance (P5)

## Governed types

Legal entities, organization-unit types, organization units, departments, cost centers, teams, cost categories/subcategories/items, GL accounts, GL-to-cost mappings, vendors, units of measure, currencies, VAT treatments, fiscal calendars/periods, project types, control-scope types, workflow types, variance reasons, risk categories, approval thresholds.

## Record shape (all types)

- `code`, `name_en`, `name_ar`, `description`
- `legal_entity_id`, `parent_id` (where hierarchical)
- `effective_start`, `effective_end`
- Status: `draft → submitted → approved → inactive`
- `created_by`, `submitted_by`, `approved_by`, `change_reason`
- Append-only audit history

## Rules

- Code uniqueness within governed scope
- Duplicate-name detection
- Hierarchy cycle prevention
- Inactive parent restrictions
- No postings to inactive records
- No hard delete when referenced
- Controlled merge/replacement for duplicates
- Parent-child type compatibility
- Leaf-posting rules for cost items
- Cross-tenant FK rejected
- Approval required before activation

## Implementation

Table: `governed_master_records` with `record_type` discriminator and JSONB `attributes` for type-specific fields validated by command layer.

Commands: `rpc_master_data_create_draft`, `submit`, `approve`, `deactivate`, `merge`.
