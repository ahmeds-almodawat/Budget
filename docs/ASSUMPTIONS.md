# Assumptions

1. **Currency default:** SAR with configurable entity-level override.
2. **Financial year:** January–December unless configured per legal entity.
3. **Timezone display:** Asia/Riyadh default; stored timestamps in UTC.
4. **VAT:** Configurable per transaction; 15% used only in examples, not hard-coded globally.
5. **ERP boundary:** External ERP remains system-of-record for posted GL; this platform owns budgets, forecasts, commitments, progress, and management reporting.
6. **Local Supabase:** Development assumes `supabase start` when Docker is available; dashboards use typed seed data until connected.
7. **Performance weights:** Default 35/35/20/10 stored as configurable settings, not immutable constants.
8. **Organizational levels:** Up to five levels supported; entities may use fewer without artificial cost-center nodes.
9. **Leaf posting:** Financial values post to governed leaf cost items only; parent rollups are calculated.
10. **Segregation of duties:** Budget owners cannot approve their own submitted budgets when approval workflow is enforced server-side.
