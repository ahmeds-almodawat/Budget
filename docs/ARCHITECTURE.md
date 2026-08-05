# Architecture

## System architecture

```mermaid
flowchart TB
  subgraph client [Client]
    UI[Next.js App Router]
    I18n[next-intl AR/EN RTL/LTR]
  end
  subgraph app [Application Layer]
    Pages[Feature Pages]
    Domain[Domain Services]
    AuthZ[Permission Checks]
  end
  subgraph data [Data Layer]
    Supa[Supabase Client SSR]
    PG[(PostgreSQL + RLS)]
    Storage[Supabase Storage]
  end
  UI --> Pages
  I18n --> Pages
  Pages --> Domain
  Pages --> AuthZ
  Domain --> Supa
  AuthZ --> Supa
  Supa --> PG
  Supa --> Storage
```

## Modular feature layout

| Module | Path | Responsibility |
|--------|------|----------------|
| Identity | `src/domain/auth` | Roles, permissions, segregation checks |
| Financial | `src/domain/financial` | EV, EAC, VAT, variance formulas |
| Organization | DB + future services | OBS hierarchy |
| Budgets | DB + UI routes | Versions, lines, monthly allocations |
| Projects | DB + UI routes | WBS, milestones, schedule baselines |
| Actuals | DB + imports | Immutable source + allocations |
| Dashboards | `src/app/[locale]/dashboard` | Seed/DB-backed KPIs |

## Security model

- Deny-by-default RLS on exposed tables
- Server-side permission checks mirror UI capabilities
- Posted financial records: no UPDATE/DELETE; reversals only
- Audit events append-only

See [DECISIONS.md](./DECISIONS.md) and [SECURITY_REVIEW.md](./SECURITY_REVIEW.md).
