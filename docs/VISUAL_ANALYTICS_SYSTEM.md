# Visual Analytics System

**Branch:** `feat/visual-analytics-kpis-charts`  
**Base:** `main` @ `3f60e6111653c528fca126cdc9cb2f391c5bcafe`  
**Status:** INDEPENDENT AUDIT PASSED — CORRECTIONS VERIFIED

## Principles

- Charts **visualize** authoritative business data; they do **not** define accounting logic.
- Same component tree for Light / Dark / System; only semantic tokens change.
- English and Arabic (RTL) share one implementation.
- No mock KPIs, fake trends, or invented history. Missing series → professional empty state.
- `null`, load failure, and numeric zero are distinct states. Compact money formatting is presentation-only; chart accessibility tables and report/export tables retain exact values.

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

Chart series colors use `--chart-1`…`--chart-6`, `--success`, `--warning`, `--danger`, and `--information` via `chartCssVar`. Grid, axis, and tooltip colors also retain CSS-variable references, so a live theme change updates presentation without reloading or recomputing data.

## KPI system

`KpiCard` / `KpiGrid` show label, compact value, optional variance % with **classification-aware** tone (`favorable` / `unfavorable` from existing domain classifiers — revenue and expense directions differ). Sparklines render only when a real multi-point series exists.

## Dashboard layouts

- **Executive:** KPI row, revenue & profitability trends, utilization bars, gross-to-net + profitability waterfalls, exception cards, deterministic insights.
- **Cost control / BVA:** trend mode switch (revenue / expense / profitability), bridges, top variances.
- **Hospital / Restaurant:** financial KPIs and branch/category bars from existing performance fetches. No occupancy, visits, surgery, bed-use, customer-count, or average-check metric is inferred.
- **Projects:** EVM KPI group from `calculateEarnedValue`; trend empty when no period history.
- **Timeline:** Gantt + roadmap + mobile chronology from real baseline/forecast dates.
- **Procurement:** pipeline funnel from the exact `getProcurementPipelineReport` result. The current report provides requisition, RFQ, award, and purchase-order stages only, capped at the latest 200 rows per stage; the visual discloses that scope. Unknown monetary amounts render as unavailable, not zero. No paid/settled/executed stage is shown.
- **Period close:** readiness ring from checklist result counts (presentation only).
- **Approvals:** age buckets (not SLA).
- **Performance:** appraisal status completion bars (no public rankings / narratives).
- **Risks:** matrix only when 1–5 scales exist; otherwise open-risk summary.

## Financial visual semantics

- Gross-to-net waterfall: Gross − deductions ± adjustments = Net (authoritative components).
- Profitability bridge: Net − COR = GP − Payroll − OpEx = Operating Contribution. **CAPEX excluded** from the bridge and shown as a separate KPI.
- Variance bars use `classifyRevenueVarianceStatus` / `classifyExpenseVarianceStatus`.
- The expense trend intentionally omits `commitment_open_current`: that value is a current snapshot repeated at monthly view grain, not historical commitment data.
- Profitability ratios from the database are converted from ratios to percentage points only at formatting time.

## Intentionally unavailable / omitted visuals

| Visual | Reason |
|---|---|
| Liquidity / cash KPI | No authoritative liquidity metric in app |
| Occupancy / patient visits / surgeries | Not in database |
| Customer counts / average check (beyond existing covers) | Not invented |
| EVM multi-period trend | Only current snapshot in `v_project_earned_value` |
| Risk 5×5 matrix | Probability/impact 1–5 scales not present on risk rows |
| Downstream receipt/invoice/payment pipeline | The current procurement report does not return those stages; no stage is inferred |
| Bank “Paid” / settled / executed stage | No authoritative bank or cash-settlement source |
| Hospital multi-period trend | The dashboard action returns a current snapshot only |
| Draft forecast trend when no current approved version exists | An unapproved version is not presented as the authoritative forecast |

## Accessibility & responsive

- KPI values remain readable without charts; every Recharts series has a screen-reader table containing the exact point values; progress bars are labeled; status is not color-only.
- Desktop: full charts; tablet: stack; mobile: compact KPIs, Gantt → chronology containing the same authoritative items.
- Numeric axes may stay LTR for readability; surrounding chrome respects RTL.
- Gantt date geometry and its today marker use the configured `Asia/Riyadh` business date. The date axis is explicitly LTR while labels remain in the page direction.
- The audited viewports are 1440×900, 1280×800, 1024×768, 768×1024, 390×844, and 360×800. Executive, BVA, project timeline, and procurement have no document-level horizontal overflow at those sizes.

## Report visual preview rules

- The authoritative report table remains primary.
- BVA preview groups only the rows returned by the selected report and sums its non-null monthly budget and MTD actual fields by financial reporting group.
- Procurement preview charts document counts, not incomplete monetary totals.
- Period-close readiness is the proportion of returned module controls that are ready or already hard-closed/archived; it does not read nonexistent percentage fields.
- Appraisal completion is weighted as total finalized assignments divided by total assignments. It is not an average of per-cycle percentages.
- No preview truncates chart categories. The visible table remains a 50-row preview, while the visual uses the complete returned report result.

## Regression posture

No migrations, no formula changes, no RLS/grant changes. Existing financial tests remain the authority when chart output disagrees with them.
