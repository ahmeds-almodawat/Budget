# Domain Model

## Independent dimensions

The platform combines dimensions in reports rather than forcing a single hierarchy:

| Dimension | Purpose |
|-----------|---------|
| Organizational Breakdown (OBS) | Who is responsible |
| Cost Breakdown (CBS) | Nature of cost/revenue |
| Work Breakdown (WBS) | What work is performed |
| Time | Financial periods, schedule dates |
| Control Scope | Universal planning object |
| Control Account | Primary measurement node |

## Entity relationships

```mermaid
erDiagram
  LEGAL_ENTITY ||--o{ ORGANIZATION_UNIT : contains
  LEGAL_ENTITY ||--o{ CONTROL_SCOPE : plans
  CONTROL_SCOPE ||--o| PROJECT : may_be
  PROJECT ||--o{ PROJECT_PHASE : has
  PROJECT_PHASE ||--o{ WORK_PACKAGE : has
  WORK_PACKAGE ||--o{ TASK : has
  CONTROL_SCOPE ||--o{ CONTROL_ACCOUNT : measures
  CONTROL_ACCOUNT }o--|| COST_NODE : classifies
  CONTROL_ACCOUNT }o--o| ORGANIZATION_UNIT : owns
  BUDGET_VERSION ||--o{ BUDGET_LINE : contains
  BUDGET_LINE ||--o{ BUDGET_MONTHLY_ALLOCATION : distributes
  ACTUAL_TRANSACTION ||--o{ ACTUAL_ALLOCATION : splits
```

## Control scope types

Operational budgets, projects, programs, capital initiatives, department plans, restaurant openings, annual business plans, cost-reduction and revenue plans.

## Budget lifecycle

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted
  Submitted --> UnderReview
  UnderReview --> Approved
  UnderReview --> Rejected
  Approved --> Locked
  Locked --> Superseded
  Rejected --> Draft
```

Approved financial history is immutable; changes create new version records or change-request lines with before/after values.
