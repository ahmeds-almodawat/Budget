# Visual Analytics System

**Branch:** `feat/visual-analytics-kpis-charts`  
**Base:** `main` @ `3f60e6111653c528fca126cdc9cb2f391c5bcafe`  
**Status:** LOCAL VISUAL ANALYTICS — NOT PRODUCTION READY

## Principles

- Charts **visualize** authoritative business data; they do **not** define accounting logic.
- Same component tree for Light / Dark / System; only semantic tokens change.
- English and Arabic (RTL) share one implementation.
- No mock KPIs, fake trends, or invented history. Missing series → professional empty state.
- Compact money formatting is presentation-only; tables/exports keep exact values.

## Shared library

| Layer | Location |
|---|---|
| Types | `src/domain/analytics/types.ts` |
| Formatting | `src/domain/analytics/format.ts` |
| Bridges | `src/domain/analytics/bridges.ts` |
| Series | `src/domain/analytics/series.ts` |
| Timeline / pipeline / close progress | `src/domain/analytics/timeline.ts` |
| UI | `src/components/analytics/*` |
| Executive view-model | `src/lib/analytics/executive-view-model.ts` |

Chart series colors use `--chart-1`…`--chart-6`, `--success`, `--warning`, `--danger`, `--information` via `chartCssVar`. Theme changes update charts without reload (MutationObserver on `html.class`).

## KPI system

`KpiCard` / `KpiGrid` show label, compact value, optional variance % with **classification-aware** tone (`favorable` / `unfavorable` from existing domain classifiers — revenue and expense directions differ). Sparklines render only when a real multi-point series exists.

## Dashboard layouts

- **Executive:** KPI row, revenue & profitability trends, utilization bars, gross-to-net + profitability waterfalls, exception cards, deterministic insights.
- **Cost control / BVA:** trend mode switch (revenue / expense / profitability), bridges, top variances.
- **Hospital / Restaurant:** operational KPIs + branch/category bars from existing performance fetches.
- **Projects:** EVM KPI group from `calculateEarnedValue`; trend empty when no period history.
- **Timeline:** Gantt + roadmap + mobile chronology from real baseline/forecast dates.
- **Procurement:** pipeline funnel from `getProcurementPipelineReport` (ready-for-payment ≠ paid).
- **Period close:** readiness ring from checklist result counts (presentation only).
- **Approvals:** age buckets (not SLA).
- **Performance:** appraisal status completion bars (no public rankings / narratives).
- **Risks:** matrix only when 1–5 scales exist; otherwise open-risk summary.

## Financial visual semantics

- Gross-to-net waterfall: Gross − deductions ± adjustments = Net (authoritative components).
- Profitability bridge: Net − COR = GP − Payroll − OpEx = Operating Contribution. **CAPEX excluded** from the bridge and shown as a separate KPI.
- Variance bars use `classifyRevenueVarianceStatus` / `classifyExpenseVarianceStatus`.

## Intentionally unavailable / omitted visuals

| Visual | Reason |
|---|---|
| Liquidity / cash KPI | No authoritative liquidity metric in app |
| Occupancy / patient visits / surgeries | Not in database |
| Customer counts / average check (beyond existing covers) | Not invented |
| EVM multi-period trend | Only current snapshot in `v_project_earned_value` |
| Risk 5×5 matrix | Probability/impact 1–5 scales not present on risk rows |
| Bank “Paid” stage | Out of scope; stop at payment readiness |

## Accessibility & responsive

- KPI values remain readable without charts; progressbars labeled; status not color-only.
- Desktop: full charts; tablet: stack; mobile: compact KPIs, Gantt → chronology.
- Numeric axes may stay LTR for readability; surrounding chrome respects RTL.

## Regression posture

No migrations, no formula changes, no RLS/grant changes. Existing financial tests remain the authority when chart output disagrees with them.
