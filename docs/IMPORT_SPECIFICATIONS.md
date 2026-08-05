# Import Specifications

## Supported templates (planned)

- Actual accounting transactions
- Operational budgets
- Project budgets
- Commitments
- Milestones, tasks, vendors, cost mappings

## Workflow

1. Upload → 2. Parse → 3. Validate → 4. Errors/warnings → 5. Duplicate detection → 6. Total reconciliation → 7. Dimension mapping → 8. Approve → 9. Post → 10. Preserve batch + raw rows

## Integrity rules

- Source fields immutable after post
- Unmapped queue — never silent exclusion
- Allocations must reconcile to source amount
- Duplicate candidates → review queue (no auto-delete)

Schema: `import_batches`, `imported_source_rows`, `actual_transactions`.
