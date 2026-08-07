# Codex Independent Visual Analytics Audit

**Repository:** `ahmeds-almodawat/Budget`

**Base:** `main` @ `3f60e6111653c528fca126cdc9cb2f391c5bcafe`

**Audited branch baseline:** `feat/visual-analytics-kpis-charts` @ `cba5360d72f93cb183abaebc79d3625dc3e549cc`

**Audit date:** 2026-08-07
**Scope:** KPIs, charts, timelines, data authority, localization, RTL, theme behavior, accessibility, responsive behavior, and visual E2E quality.

## Executive conclusion

The branch required corrections before pull-request creation. The audit found no invented financial source rows, no `Math.random`, no mock history, no migration change, and no change to RLS, grants, permissions, segregation of duties, procurement/payment workflow semantics, or authoritative financial formulas. It did find material presentation defects that could misstate management information: database failures were converted to zero/no-data, gross margin was displayed at one-hundredth of its true percentage, an authoritative zero net-revenue value could be replaced, a current commitment snapshot was presented across historical periods, and report readiness/completion previews used invalid aggregation.

The corrections are presentation/data-selection changes only. Existing financial calculations remain in `src/domain/financial/calculations.ts`, the authoritative database views, and the existing EVM implementation.

## Findings and corrections

| ID | Severity | Area and evidence | Failure mode | Correction | Regression evidence |
|---|---|---|---|---|---|
| VA-001 | High | `src/app/[locale]/dashboard/executive/page.tsx` | Supabase query errors were ignored and counts/data became zero. The delayed-milestone count also lacked an explicit active-entity join filter. An unavailable source could look like a healthy zero, and a multi-entity user could receive a cross-entity aggregate. | All executive sources now resolve together, every query error fails the analytics model into a localized error state, and milestones are joined through project/control-scope legal entity. | Focused browser check rendered the active entity only; full authorization regression suite remains authoritative. |
| VA-002 | High | `src/lib/analytics/executive-view-model.ts` | `gross_margin_percentage` is a ratio, but formatting treated it as percentage points. A database value `0.837579...` displayed as `0.8%` instead of `83.8%`. | Multiply the ratio by 100 only at the formatting boundary. | Unit test asserts a `0.4` source ratio renders `40.0%`; guarded fixture renders `83.8%`. |
| VA-003 | High | `src/lib/analytics/executive-view-model.ts`; `src/components/financial/budget-vs-actual-workspace.tsx` | `profitTotals.net || revenueActual` replaced a legitimate authoritative zero with a different revenue measure. | Use profitability-row presence, not numeric truthiness, to select the authoritative source. | Unit test asserts the profitability bridge preserves net revenue `0`. |
| VA-004 | Medium | `src/components/financial/budget-vs-actual-workspace.tsx`; `src/domain/analytics/series.ts` | `commitment_open_current` is a present-time snapshot repeated at monthly view grain. Plotting it by period implied nonexistent commitment history. | Remove it from the historical expense trend. It remains in current classification utilization, where its grain is honest. | Static series audit and BVA E2E source-value assertion. |
| VA-005 | High | `src/components/reports/reports-workspace.tsx` | Period readiness attempted to average fields not returned by the repository, producing zero. Appraisal completion averaged cycle rates rather than weighting assignments. Procurement null amounts were treated as monetary zero, and categories were truncated. | Period readiness now uses returned control states; appraisal completion uses total finalized / total assignments; procurement preview charts counts; no category slicing; load failures render an error. | E2E asserts BVA report preview equals the complete returned result (`Revenue`, SAR 162,000.00 actual). |
| VA-006 | Medium | `src/domain/analytics/timeline.ts`; `src/components/governance/procurement-analytics-panel.tsx` | Unknown stage amounts became zero; unsupported empty stages were presented; future unknown stages could be dropped. | A stage with any unknown amount shows `—`; only repository-supported stages are predeclared; encountered future stages are retained. The latest-200-per-stage repository limit is disclosed. | Unit test covers mixed null/non-null stage amounts. |
| VA-007 | Medium | `src/components/governance/fulfillment-workspace.tsx` | Invoice match identifiers and the screen-reader word “amount” were exposed in English/raw database form. | Map every known identifier to EN/AR messages, use a localized unknown fallback, and localize the amount label. | Mapping unit test plus EN/AR key-parity test. |
| VA-008 | Medium | `src/components/analytics/financial-trend-chart.tsx` | Category tooltips formatted percentages and document counts as SAR. Null tooltip values could become zero. Charts lacked an exact non-visual representation. | Series declare `money`, `percent`, `number`, or `ratio`; null renders `—`; every chart includes a localized screen-reader table with exact values. | E2E asserts exact chart-table values; theme test confirms values are unchanged. |
| VA-009 | Medium | `src/components/financial/budget-vs-actual-workspace.tsx`; `src/app/[locale]/dashboard/hospital/page.tsx`; `src/app/[locale]/projects/[id]/page.tsx` | Real zeros caused empty bridges, omitted utilization points/subtitles, or “N/A” for zero EAC/VAC. | Empty state now depends on source-row presence; zero points and zero money remain visible; project null checks are explicit. | E2E asserts CAPEX zero is rendered as `SAR 0.00`. |
| VA-010 | Medium | `src/components/analytics/chart-theme.ts` | Resolved grid/axis/tooltip colors were memoized and could remain from the prior theme. | Keep semantic CSS-variable references so live theme changes update without data reload. | E2E switches Light → Dark → Light and asserts the source metric text is unchanged. |
| VA-011 | Medium | `src/components/analytics/financial-trend-chart.tsx`; `src/components/layout/app-shell.tsx` | Screen-reader tables and the mobile header produced document-level horizontal overflow. | Constrain accessible tables inside a clipped wrapper and use a shrinkable, wrapping header grid that preserves the full mobile theme control. | Browser audit passed all four routes at six required viewport sizes; mobile theme focus/control E2E passes. |
| VA-012 | Low | `src/domain/analytics/timeline.ts`; project timeline components | UTC calendar dates could shift the delayed/today decision around Riyadh midnight; Gantt strings and status text were English. | Use configured `Asia/Riyadh` calendar date, pass one date through source transformation and display, localize labels/status, and keep only the numeric axis LTR. | Timezone unit test; Arabic timeline E2E asserts translated in-progress state. |

## KPI source matrix

| KPI | Authoritative source | Transformation | Display / comparison |
|---|---|---|---|
| Executive net revenue | `v_revenue_budget_vs_actual.actual_net_revenue` | Sum returned fiscal-year rows | Compact SAR; exact chart table. Guarded fixture: SAR 157,000.00. |
| Revenue vs budget | Same view: actual net and budgeted revenue | Existing revenue variance direction: actual − budget; existing classifier | Favorable/unfavorable is classification-aware, never sign-only. |
| Gross profit | `v_profitability_period_performance.gross_profit` | Sum returned rows | Compact SAR. |
| Gross margin | Latest returned profitability period `gross_margin_percentage` | Ratio × 100 for formatting only | Percent; guarded fixture 83.8%. |
| Operating contribution | `v_profitability_period_performance.operating_contribution` | Sum returned rows | CAPEX excluded by authoritative view and bridge. |
| Actual operating cost | `v_budget_vs_actual.mtd_actual` | Sum expense rows | Existing expense classifier: budget − actual. |
| Open commitments | `commitments` | Existing `calculateOpenCommitment` using committed, invoiced-applied, and cancelled values | Compact SAR; link retains active entity context. |
| CAPEX | `v_profitability_period_performance.capex_actual` | Sum only | Separate KPI with explicit exclusion note. |
| Hospital MTD/YTD/approved/forecast | `fetchHospitalDashboardAction` | Existing domain variance functions; no invented history | Snapshot KPIs and MTD/YTD utilization only. |
| Restaurant revenue / food-cost % | `fetchRestaurantPerformanceAction` | Existing repository percentage calculation | Revenue SAR and percentage units; no invented operational KPI. |
| Project BAC/PV/EV/AC/CV/SV/CPI/SPI/EAC | Existing project dashboard EVM result | Numeric conversion and formatting only | No second EVM formula and no historical line. |
| Forecast KPIs | Existing forecast versions/lines | Status-filtered sums; current approved version only for profile | Draft/review values are not represented as approved. |
| Period close readiness | Loaded checklist results | Passed/waived ÷ checklist total | Presentation progress only; authoritative readiness action still gates close. |
| Appraisal completion | Distinct visible assignment IDs | Finalized/acknowledged ÷ total | No scores, comments, or public ranking. |

## Chart source matrix

| Visual | Source → transformation → output |
|---|---|
| Revenue trend | Revenue BVA rows → sum by `period_number`, chronological numeric sort → budget/actual area chart plus exact table. |
| Expense trend | Expense BVA rows → sum monthly budget/MTD actual by period → two-series line chart; current commitment snapshot omitted. |
| Profitability trend | Profitability view rows → sum by period → net revenue/gross profit/operating contribution. |
| Utilization | Current BVA rows → group by financial reporting classification → budget, actual, current commitment, non-negative remaining. |
| Gross-to-net | Authoritative component amounts → presentation sign normalization → Gross − rejection − discounts − refunds − credit notes − other deductions ± adjustments = Net. |
| Profitability bridge | Authoritative profitability row totals → presentation waterfall → Net − COR − Payroll − OpEx = operating contribution; CAPEX omitted. |
| Restaurant comparison | Authoritative branch rows → no cross-branch reallocation → revenue and food-cost percentage bars. |
| Procurement | Current report rows (latest 200 per returned stage) → count and known-amount aggregation → supported-stage funnel; unknown amount is unavailable. |
| Report BVA | Current fetched report result → group by reporting classification → budget/actual bars; no category truncation. |
| Report close readiness | Current fetched module rows → ready/already-closed share → progress bar. |
| Report appraisal completion | Current fetched cycles → weighted assignment totals → progress bar. |

## Timeline audit

- Project, phase, and milestone items use only stored baseline, forecast, actual, approved-progress, and hierarchy fields.
- “Delayed” is derived only when an authoritative forecast date is before the configured business date and the item is incomplete.
- Desktop Gantt, roadmap, and mobile chronology receive the same item array. No synthetic event or interpolated history is created.
- Date geometry is chronological and explicitly LTR; project labels and surrounding page remain RTL in Arabic.
- At 390×844 and 360×800 the desktop Gantt is hidden and the complete compact chronology is visible.

## Localization, RTL, theme, and accessibility

- EN/AR key parity passes with 1,043 keys in each catalog.
- Raw invoice match identifiers, appraisal status summary labels, Gantt labels, risk-matrix accessible name, lifecycle label, CAPEX note, and management insights are localized.
- Arabic Light and Dark were exercised on Executive, BVA, Hospital, Restaurant, Project, Timeline, Procurement, Period Close, and Performance. Each rendered `dir="rtl"`, used the selected theme, and had no document overflow or audited raw English visual identifier.
- Semantic theme tokens are used throughout; no changed visual source contains a hardcoded hex/RGB color.
- Exact screen-reader tables accompany Recharts output. KPI text, progress labels, roadmap text, and exception counts ensure color/shape is not the only channel.
- KPI/report links use the locale prefix and remain within routes already authorized by the server route guard.

## Responsive evidence

Browser measurements covered Executive, BVA, Project Timeline, and Procurement at:

| Viewport | Result |
|---|---|
| 1440×900 | No document overflow; desktop Gantt visible. |
| 1280×800 | No document overflow; desktop Gantt visible. |
| 1024×768 | No document overflow; desktop Gantt visible. |
| 768×1024 | No document overflow; desktop Gantt visible at the defined breakpoint. |
| 390×844 | No document overflow; compact chronology visible; desktop Gantt hidden. |
| 360×800 | No document overflow; compact chronology visible; desktop Gantt hidden. |

## Test evidence

| Gate | Result |
|---|---|
| Pre-write Git gate | Passed at required branch/base/head; clean baseline; no migration in branch. |
| First `npm ci` | Passed, exit 0; 699 packages added; 2 known Moderate `exceljs → uuid` advisories remain; no dependency change. |
| Fresh `supabase db reset` | Passed on first reset. |
| Guarded fixture loader | Initial refusal without `ALLOW_LOCAL_FIXTURES=true` proved the guard; explicit local guarded run loaded 15 personas. |
| Unit tests | 173/173 passed across 27 files; includes percentage, zero preservation, timezone, pipeline null, bridge, status mapping, and series evidence. |
| Database tests | 102/102 passed, including tenant isolation, immutable records, SOD, financial views, procurement, period close, appraisal, and controlled RPC checks. |
| Import security | 17/17 passed. |
| Concurrency | 9/9 passed. |
| Visual E2E | Focused visual suite 5/5 passed, retries 0. Exact authoritative actuals, zero, theme stability, Arabic translation, BVA, Gantt fallback, report aggregation, and overflow are asserted. |
| Localization | Passed; EN/AR parity 1,043 / 1,043. |
| Full E2E stability | The first combined command exceeded the audit harness's five-minute limit while Playwright remained active; it was not counted as a pass. The first complete run exposed 9 failures (63/72), the corrective targeted run exposed 3 selector failures (36/39), and the next full run exposed the final equivalent selector defect (71/72). After correction and fresh database reset, the complete suite passed 72/72 in 8.3 minutes with one worker and retries disabled. |
| Production build | Passed on the first clean attempt after stopping the E2E dev server; Next.js 16.3.0 compiled, type-checked, generated 87 static pages, and finalized successfully in 30.8 seconds. |

## Remaining visual limitations

- There is no authoritative historical EVM series or hospital trend; both remain intentionally empty rather than fabricated.
- Risk rows do not expose validated 1–5 probability/impact scales in the audited page source, so the heat matrix remains omitted there.
- Procurement reporting currently returns only requisition, RFQ, award, and purchase-order stages and caps each query at 200. The visual states the cap and does not infer downstream states.
- Report table column headers remain database field names. This pre-existing technical report-preview convention is bilingual only at the report selector/title level; it is a non-blocking localization limitation for a later report-schema labeling project.
- Compact KPI cards intentionally round large values; exact values are available in accessible chart tables and authoritative report/export tables.
- No screenshot baseline is used. Behavioral and exact-value assertions are preferred to pixel snapshots.

## Security/change-boundary assessment

The correction diff contains no Supabase migration, RLS policy, grant, permission, SOD, state-machine, authentication, procurement workflow, payment workflow, or financial formula change. The shared-shell change replaces the header's non-wrapping row with a shrinkable grid/wrapping control group, preserving the full three-button mobile theme control while removing overflow; theme preference and values are unchanged.

## Recommendation

The corrected branch is ready for a pull request after the final diff-boundary review. Commit exactly `fix: harden visual analytics presentation and data fidelity`, push only `feat/visual-analytics-kpis-charts`, and open no pull request, merge, or deployment action from this audit.
