# B1 Localization Completion Report

Migration branch: `fix/audit-p4-localization-forecast-rpc`  
Date: 2026-08-06

## Summary

B1 localization migration is complete. User-visible strings previously inlined with `locale === "ar"` / `isArabic` ternaries were moved into `messages/en.json` and `messages/ar.json`, with bilingual database fields routed through `pickLocalized()` and UI copy through `getTranslations` / `useTranslations`.

## Counts

| Metric | Before | After |
|--------|--------|-------|
| Translation keys (EN / AR) | ~139 / ~139 | **375 / 375** |
| Files with inline `locale === "ar"` or `isArabic` | **39** | **1** (justified) |
| Namespaces in message catalogs | 9 top-level | **28 top-level** |
| Namespaces referenced in source | — | **180** leaf paths |

`npm run test:i18n` passes with EN/AR parity.

## New infrastructure

- `src/lib/i18n/display.ts`
  - `pickLocalized(locale, english?, arabic?)` — bilingual DB fields (`name_en`/`name_ar`, `title_en`/`title_ar`, etc.)
  - `otherLocale(locale)` — locale switcher target (`en` ↔ `ar`)
  - `numberLocale(locale)` — `Intl` number formatting (`ar-SA` / `en-SA`)

## Message namespaces added

| Namespace | Purpose |
|-----------|---------|
| `pages` | Route titles, empty states, cross-links |
| `workspace` | Shared workspace chrome (none, open, vendors, notes) |
| `budgetWorkflow` | Hospital budget workflow actions and labels |
| `modules` | Module placeholder titles/descriptions (from former `moduleDescriptions`) |
| `timeline` | Project timeline page |
| `audit` | Audit search workspace |
| `reports` | Reports workspace |
| `imports` | Actual import workflow |
| `commitments` | Commitments workspace tabs |
| `actuals` | Actuals workspace tabs |
| `approvals` | Approvals inbox tabs and item types |
| `milestones` | Milestone detail / progress workflows |
| `changes` | Schedule extension workflow |
| `exceptions` | Exceptions & alerts page sections |
| `transactions` | Budget line transaction drill-down |
| `dashboardLabels` | Extra dashboard labels (hospital, restaurant, executive, project) |
| `sidebar` | Product tagline switch labels (`switchToArabic` / `switchToEnglish`) |

Existing namespaces (`common`, `nav`, `dashboard.*`, `auth`, `budget`, `project`, `financial`, `forecasts`, `status`) were retained.

## Justified retained inline locale branches

| File | Reason |
|------|--------|
| `src/app/[locale]/layout.tsx` | Sets HTML `dir` (`rtl` vs `ltr`) from locale — structural, not copy. Must remain locale-aware at the document root. |
| `src/lib/i18n/display.ts` | Canonical localization helpers (`pickLocalized`, `otherLocale`). Intentionally contains `locale === "ar"`; excluded from inline-violation scan in `scripts/check-translations.mjs`. |

### Former special cases (now migrated)

| File | Resolution |
|------|------------|
| `src/components/auth/auth-user-bar.tsx` | Uses `pickLocalized(locale, user.displayName, user.displayNameAr)` instead of inline branch |
| `src/components/layout/app-sidebar.tsx` | `pickLocalized` for `productConfig.workingName`; `otherLocale()` for locale switch href |
| `src/components/auth/sign-in-form.tsx` | `otherLocale()` + `sidebar` translation keys for language link |

## Route coverage (migrated)

All locale-scoped app routes now use catalogs and/or `pickLocalized`:

- `/` (home)
- `/dashboard/executive`, `/dashboard/hospital`, `/dashboard/restaurant`
- `/budgets`, `/budgets/transactions/[lineId]`
- `/projects`, `/projects/[id]`, `/projects/[id]/timeline`
- `/milestones`, `/milestones/[id]`, `/milestones/progress-approval`
- `/tasks`, `/changes`
- `/commitments`, `/actuals`, `/imports`, `/forecasts`
- `/risks`, `/issues`, `/actions`, `/decisions`
- `/approvals`, `/audit`, `/exceptions`
- `/reports`, `/performance`
- Module placeholders: `/cost-control`, `/master-data`, `/administration`, etc.
- Auth: `/auth/sign-in` (language switch)

## Files migrated (39 → 0 unjustified)

All previously flagged files were updated except `layout.tsx` (justified above):

`actions/page.tsx`, `actuals/page.tsx`, `actuals-workspace.tsx`, `approvals/page.tsx`, `approvals-workspace.tsx`, `audit/page.tsx`, `audit-search-workspace.tsx`, `auth-user-bar.tsx`, `sign-in-form.tsx`, `hospital-budget-workflow.tsx`, `transactions/[lineId]/page.tsx`, `changes/page.tsx`, `commitments/page.tsx`, `commitments-workspace.tsx`, `dashboard/executive/page.tsx`, `dashboard/hospital/page.tsx`, `dashboard/restaurant/page.tsx`, `decisions/page.tsx`, `exceptions/page.tsx`, `actual-import-workflow.tsx`, `imports/page.tsx`, `issues/page.tsx`, `kpi-cards.tsx`, `app-sidebar.tsx`, `milestone-detail-workflow.tsx`, `milestones/page.tsx`, `milestones/progress-approval/page.tsx`, `module-placeholder-page.tsx`, `page.tsx`, `performance/page.tsx`, `progress-approval-workflow.tsx`, `projects/page.tsx`, `projects/[id]/page.tsx`, `projects/[id]/timeline/page.tsx`, `reports/page.tsx`, `reports-workspace.tsx`, `risks/page.tsx`, `schedule-changes-workflow.tsx`, `tasks/page.tsx`

## Verification

```bash
npm run test:i18n
# Translation keys: EN=375 AR=375 (parity OK)
# Inline locale branches remaining (1 files): src/app/[locale]/layout.tsx
# Translation completeness check passed.
```

```bash
npm run build
# Completed successfully
```
