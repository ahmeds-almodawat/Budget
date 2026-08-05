# Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | Decimal.js for all client-side financial math | Avoid floating-point errors |
| D-002 | Independent dimensions vs fixed hierarchy | Required for flexible drill-down reporting |
| D-003 | Seed data fallback when Supabase unavailable | Enables dashboard development offline |
| D-004 | next-intl with `[locale]` segment | Structured bilingual routing |
| D-005 | Immutable posted actuals | ERP integration integrity |
| D-006 | npm (not pnpm) | pnpm not installed in environment |
| D-008 | Isolated Supabase ports 56000–56009 | Avoid grc-control-center conflict and Windows excluded ranges |
