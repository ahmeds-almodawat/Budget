# Codex Independent Dual-Theme, Accessibility, and Functional Regression Audit

## 1. Executive conclusion

The dual-theme implementation at audited SHA `081c0a106564a233b2734aa8b1be8ffa81f5c54e` was not complete as reported. The audit reproduced one merge-blocking mobile-navigation regression, several accessibility and contrast defects, a storage-denial first-paint defect, untranslated runtime labels, semantic-token leakage, and a weakened concurrency probe that selected around invalid local fixture data.

The demonstrated theme and test defects have been corrected without changing migrations, RLS, financial formulas, approval semantics, repositories, production configuration, or the underlying local financial fixtures. The final local verification passed, including two clean database cycles and 53/53 E2E tests with Playwright retries disabled. The first failures and all retries are preserved below.

This is a conditional merge recommendation for the dual-theme correction only. It is not a production-readiness approval. Pre-existing platform limitations remain, notably unauthorized direct project routes returning server errors, strict-CSP nonce integration, partial procurement/chart modules, production identity-provider configuration, and noisy authorization/build logs.

## 2. Audit baseline and scope

| Item | Evidence |
|---|---|
| Functional baseline | `6f3b0c215bd5a72307cc2f55dcde3d7bd0bfa6c4` |
| Design SHA audited | `081c0a106564a233b2734aa8b1be8ffa81f5c54e` |
| Branch | `feat/mega-finish-platform` |
| Remote | `https://github.com/ahmeds-almodawat/Budget` |
| Pre-write gate | Passed: exact branch/SHA/remote, SHA present on origin, clean tree |
| Audited redesign diff | 68 files; 1,179 additions; 285 deletions |
| Documentation corpus | 66 files under `docs/`, plus root guidance and package/CI configuration |
| Database corpus | 43 migrations, local fixtures, database/concurrency runners, RLS/function/trigger evidence |
| Application corpus | 95 app/component files, theme/auth contexts, repositories/actions, all automated tests, exports/imports, and CI |

The redesign diff was independently classified. It contained no migration, RLS, server-action authorization, repository, financial-calculation, export, permission, or production-configuration change. The only non-visual behavioral edit was `scripts/run-concurrency-tests.mjs`, which had narrowed its reversal fixture selection.

## 3. Merge and production recommendations

### Merge recommendation

**Conditional go for the dual-theme correction after review.** All Critical findings are absent, the High theme regression is corrected, and final local checks pass. Reviewers should require the report and regression tests to travel with the change. A push to this branch does not itself trigger the current CI workflow; a pull request targeting `main` does.

### Production recommendation

**No production-readiness recommendation is made.** This audit did not deploy, access production, or apply non-local migrations. Production approval remains blocked outside the theme scope by the existing production-auth gap, a strict-CSP nonce decision for the inline theme initializer, partial modules, and uncontrolled 500 responses on some unauthorized direct routes.

## 4. Findings

### Critical

None found in the redesign diff.

### High

#### DTA-H-001 — Mobile navigation was neither reliably closable nor modal

- **Classification:** implementation defect; corrected
- **Affected code:** `src/components/layout/app-shell.tsx` (audited drawer; corrected implementation at lines 41-110)
- **Failure mode:** a full-viewport backdrop button sat behind the drawer. Its accessible name was “Close navigation,” but its center point was covered by navigation links. It had no dialog semantics, focus trap, Escape handling, focus restoration, scroll lock, or dialog title.
- **Scenario:** a keyboard or mobile user opens the drawer and cannot reliably close or contain focus. The audited E2E test timed out clicking the alleged close button.
- **Evidence:** first audited-state `npm run test:e2e` timed out after 304.1 seconds; trace localized the 30-second test timeout to `dual-theme.spec.ts` line 90, with a drawer link intercepting the click.
- **Correction:** replaced the bespoke overlay with the already-installed Radix Dialog primitive; added translated title, overlay dismissal, explicit 44px close button, focus trapping, Escape handling, focus restoration, and scroll locking.
- **Regression test:** `e2e/dual-theme.spec.ts` verifies explicit close, hidden state, dark mode, dialog semantics, Escape, and trigger focus restoration.
- **Blocks merge:** yes before correction; no after final verification.
- **Blocks production:** yes before correction.

### Medium

#### DTA-M-001 — Concurrency test selected around invalid posted fixture rows

- **Classification:** test deficiency plus bounded local-fixture debt; test corrected, fixture debt retained and surfaced
- **Affected code/data:** `scripts/run-concurrency-tests.mjs:15-24,94-178`; `supabase/fixtures/local_personas.sql:208-218`; `src/components/financial/actuals-workspace.tsx:61-84`
- **Database objects:** `actual_transactions`, `actual_transaction_allocations`, `rpc_post_actual_transaction`, `rpc_reverse_actual_transaction`
- **Failure mode:** the audited test changed from selecting a posted transaction to selecting one that already had allocations. This made the reversal test pass while six posted `REST-POS` headers had no allocations.
- **Accounting scenario:** an orphan posted header is absent from allocation-joined reports and cannot be reversed, while the UI previously displayed only “posted.” A user could mistake an incomplete accounting state for a valid posted actual.
- **Evidence:** two clean resets produced the same six source IDs: `REST-B1/B2-{REV,FOOD,LAB}-001`. The posting RPC requires exact reconciliation, and repository documentation says posted actuals reconcile to allocations. The local fixture deliberately deletes their allocations to replace the reporting path with period-linked fixture transactions.
- **Correction:** the reversal test now creates, allocates, posts, and reverses its own transaction inside a rollback-scoped user transaction. A separate probe names and bounds the six legacy local-fixture orphans. The Actuals workspace displays “Posted — Incomplete allocation” in English and Arabic; E2E requires six visible warnings.
- **Regression test:** `npm run test:concurrency` (5/5) and the Actuals E2E case.
- **Blocks merge:** no after correction; the debt is local-fixture-only and explicit.
- **Blocks production:** no direct production-data conclusion can be drawn; production data must independently enforce/monitor the documented invariant.

#### DTA-M-002 — Storage denial could bypass System resolution before first paint

- **Classification:** implementation defect; corrected
- **Affected code:** `src/lib/theme/theme.ts:31`; `src/components/theme/theme-provider.tsx:29-91`
- **Failure mode:** the whole initializer was wrapped in one `try`. If `localStorage.getItem` threw, system media resolution and DOM theme application were skipped, causing a light first paint until hydration.
- **Scenario:** privacy mode or denied storage on a dark OS produces a visible flash and inconsistent auth/application first paint.
- **Evidence:** control-flow inspection against the Next 16 flash-prevention guide; unit reproduction with `Storage.getItem` throwing and a dark media preference.
- **Correction:** storage and media reads fail independently, default remains System, a transient in-memory preference preserves interaction when writes fail, and DOM reapplication uses `useLayoutEffect` as recommended for Strict Mode remounts.
- **Regression test:** `src/lib/theme/theme.test.ts` plus browser invalid/unavailable-storage and live System-change tests.
- **Blocks merge:** yes before correction; no after verification.
- **Blocks production:** no after correction, subject to DTA-M-007.

#### DTA-M-003 — Theme radiogroup lacked required keyboard behavior and usable touch targets

- **Classification:** accessibility implementation defect; corrected
- **Affected code:** `src/components/theme/theme-toggle.tsx:19-70`
- **Failure mode:** controls used `role="radio"` without roving tab stops or Arrow/Home/End behavior and were 32×32px.
- **Scenario:** keyboard users could tab through all options but not operate the radio pattern conventionally; mobile users had undersized targets.
- **Correction:** roving `tabIndex`, Arrow/Home/End selection with focus movement, and 44×44px controls.
- **Regression test:** browser asserts ArrowRight selection/focus and computed dimensions for every radio.
- **Blocks merge:** yes for accessibility acceptance before correction; no after verification.
- **Blocks production:** no after correction.

#### DTA-M-004 — Control and destructive-button contrast failed non-text/text thresholds

- **Classification:** accessibility implementation defect; corrected
- **Affected code:** `src/app/globals.css:31,54,117,140,192,213`; `src/components/ui/button.tsx:18`
- **Failure mode:** light input border contrast was 1.45:1 against white; the dark destructive button’s white text was 2.77:1 against `#f87171`.
- **Correction:** light input border is `#7c899c` (3.55:1); dark composite input border is 3.31:1; a semantic danger foreground gives 6.77:1 in dark mode.
- **Regression test:** token presence is covered by theme tests; computed browser styles are exercised across themes. Contrast ratios were independently calculated using WCAG relative luminance.
- **Blocks merge:** yes for accessibility acceptance before correction; no after correction.
- **Blocks production:** no after correction.

#### DTA-M-005 — Actuals emitted runtime missing-message errors

- **Classification:** implementation/documentation mismatch; corrected
- **Affected code:** `src/components/financial/actuals-workspace.tsx:13-20,53`; locale keys at `messages/en.json:352-363` and `messages/ar.json:352-363`
- **Failure mode:** tab state values `batches` and `duplicates` were passed directly to translations, but the locale files define `importBatches` and `duplicateQueue`.
- **Scenario:** the page rendered while Next logged `MISSING_MESSAGE`, so a green UI assertion concealed runtime errors.
- **Evidence:** the first corrected 13/13 theme run printed both missing keys in its server log.
- **Correction:** explicit state-to-label mapping; E2E now records browser console/page errors and fails on any unexpected entry.
- **Regression test:** Actuals targeted E2E and final complete E2E suite.
- **Blocks merge:** yes before correction; no after verification.
- **Blocks production:** no after correction.

#### DTA-M-006 — Unauthorized direct project routes return 500 instead of controlled denial

- **Classification:** pre-existing implementation defect; unresolved outside theme correction
- **Affected code:** representative calls in `src/app/actions/project-actions.ts:53-196`, `src/app/actions/governance-actions.ts:30-48`, and error conversion in `src/lib/errors/safe-error.ts:50-60`
- **Failure mode:** direct finance-user navigation to `actions`, `changes`, `decisions`, `issues`, `milestones`, `risks`, and `tasks` produced HTTP 500/uncaught `PublicError` rather than a controlled access-denied page.
- **Scenario:** a user follows or types a route visible in a broadly filtered sidebar and receives a server failure; correlation IDs and sanitized errors appear in development logs.
- **Evidence:** bilingual route probe reproduced the seven routes in both locales. The authorization/data-fetch calls are unchanged from the frozen functional baseline, so this is not attributed to the redesign.
- **Recommended correction:** route-level authorization boundary that maps `FORBIDDEN` to a localized 403/access-denied experience, plus permission-aware navigation for every resource.
- **Required regression test:** direct-route matrix across viewer, finance, project manager, and group administrator asserting controlled response/status and no uncaught console error.
- **Blocks merge:** not this visual merge because it predates the branch and was not changed.
- **Blocks production:** yes for an unrestricted claim that all routes fail safely.

#### DTA-M-007 — Inline first-paint script has no strict-CSP nonce integration

- **Classification:** missing production security control; unresolved
- **Affected code:** `src/app/[locale]/layout.tsx:41-44`
- **Failure mode:** the constant inline script is safe from user-controlled injection, but a strict `script-src` policy without `'unsafe-inline'` requires a nonce or hash. No CSP policy/nonce pipeline exists in this repository.
- **Scenario:** enabling a hardened CSP could block theme initialization and reintroduce flash; allowing all inline script weakens XSS defense.
- **Recommended correction:** choose and test a nonce/hash strategy with the deployment platform before enabling strict CSP; avoid an unreviewed dynamic-rendering/cache change in this visual patch.
- **Required regression test:** production-mode response headers plus allowed/blocked script execution under the chosen CSP.
- **Blocks merge:** no.
- **Blocks production:** yes for strict-CSP signoff.

### Low

#### DTA-L-001 — Raw palette utilities leaked through the semantic theme layer

- **Classification:** implementation defect; corrected
- **Affected code:** status messages and rings across budget, import, forecast, governance, project, auth, hospital, and placeholder components.
- **Failure mode:** `green-*`, `red-*`, and `amber-*` classes bypassed dark tokens.
- **Correction:** replaced with `success`, `danger`, and `warning` semantic surface/foreground/ring tokens. A repository search now finds no Tailwind palette utilities in `src`.
- **Regression test:** static leakage scan plus theme route/browser coverage.
- **Blocks merge/production:** no after correction.

#### DTA-L-002 — RTL alignment and accessible shell labels were hardcoded in English

- **Classification:** localization/accessibility defect; corrected
- **Affected code:** report/BvA/restaurant table alignment; `src/components/layout/app-sidebar.tsx:138`; `src/components/layout/active-entity-selector.tsx:40`
- **Failure mode:** `text-left` forced physical alignment in Arabic; “Main navigation” and “Active legal entity” bypassed locale files.
- **Correction:** logical `text-start` plus English/Arabic messages.
- **Regression test:** translation parity and Arabic browser coverage.
- **Blocks merge/production:** no after correction.

#### DTA-L-003 — Chart documentation represented an unimplemented module as partially themed

- **Classification:** documentation mismatch / intentionally deferred feature; corrected documentation
- **Affected code/docs:** `docs/DUAL_THEME_DESIGN_SYSTEM.md`; dependency in `package.json`
- **Failure mode:** documentation said some page-local charts might still use library defaults. Repository-wide inventory found no Recharts component, wrapper, axis, legend, tooltip, or rendered chart at all.
- **Correction:** documentation now states charts are an unimplemented scaffold; axis/grid/tooltip tokens were completed for future use.
- **Required future test:** chart geometry/series parity, axis/legend/tooltip contrast, RTL labels, and light/dark screenshots when a chart is implemented.
- **Blocks merge:** no.
- **Blocks production:** blocks any claim that chart modules are complete.

#### DTA-L-004 — Current feature branch does not receive push CI

- **Classification:** CI configuration gap; unresolved
- **Affected code:** `.github/workflows/ci.yml:13-20`
- **Failure mode:** `feat/mega-finish-platform` is not in the push branch allowlist. A PR targeting `main` would trigger CI, but this authorized branch-only push will not.
- **Recommended correction:** use broader protected-branch rules or include active integration branches; do not treat local Windows results as Linux CI evidence.
- **Blocks merge:** CI should be observed on the eventual PR.
- **Blocks production:** no direct conclusion.

#### DTA-L-005 — Build/E2E logs are noisy despite successful exits

- **Classification:** environmental instability plus pre-existing logging defect; unresolved
- **Evidence:** successful builds print many cookie-backed “Dynamic server usage” messages labeled “Unhandled error”; successful E2E prints `ECONNRESET` during development-server shutdown and expected authorization errors from negative tests.
- **Recommended correction:** mark cookie-backed routes explicitly dynamic where appropriate and distinguish expected denial/shutdown from unhandled errors.
- **Blocks merge:** no; final exit status and route output are valid.
- **Blocks production:** no direct conclusion, but log quality affects operations.

## 5. Theme architecture assessment

| Control | Result | Evidence |
|---|---|---|
| Default is System | Pass | invalid/missing preference resolves to System |
| Explicit Light/Dark persistence | Pass | localStorage and reload E2E |
| Live OS change | Pass | media-event subscription and `emulateMedia` E2E |
| Multi-tab synchronization | Pass | storage-event E2E |
| Back/forward persistence | Pass | history E2E |
| No application remount/refetch on toggle | Pass | shared component tree; form value retained across toggle |
| Storage unavailable | Corrected/pass | independent fallback plus transient preference |
| First-paint flash prevention | Corrected/pass | blocking constant initializer; layout effect after hydration |
| Listener cleanup | Pass | both subscriptions return removers |
| Narrow hydration suppression | Pass | only `<html>`; justified by pre-paint class/attributes |
| Auth and authenticated pages | Pass | sign-in and shell cases in both themes |
| Strict CSP | Open | nonce/hash integration not configured (DTA-M-007) |

## 6. Token, contrast, chart, and visual hierarchy assessment

The component tree is shared across themes; theme differences are confined to semantic token values. The audit corrected remaining palette utilities and added semantic chart axis/tooltip bridges. Product configuration’s documented brand color values remain legitimate fixed business/brand data.

| Area | Light | Dark | Result |
|---|---|---|---|
| Page/sidebar/card hierarchy | distinct light surfaces | midnight canvas/sidebar with raised cards | Pass |
| Primary action contrast | white on blue | dark text on cyan | Pass |
| Input boundary | 3.55:1 | 3.31:1 composite | Corrected/pass |
| Destructive button | white on dark red | dark text on light red, 6.77:1 | Corrected/pass |
| Status styling | semantic surface + text | semantic translucent surface + text | Corrected/pass |
| Charts | no rendered instance | no rendered instance | Scaffold; not complete |

Manual images of the 390px dark executive dashboard and 1440px Arabic/light cost-control workspace confirmed readable hierarchy, consistent cards, correct sidebar side, logical alignment, and no document-level overflow. No screenshots were committed.

## 7. Route, responsive, RTL, and localization assessment

- Production build discovered 38 application routes and generated 71 static pages.
- Source/diff inspection covered auth, financial, projects, milestones, governance, procurement, reports, performance, administration, master data, hospital, and restaurant modules, including dynamic detail routes inheriting the same shell.
- A browser matrix executed 72 combinations: home, cost-control, and budgets × English/Arabic × Light/Dark × widths 1440, 1280, 1024, 768, 390, and 360. All returned 200, applied the expected `dir` and theme, and had no document-level overflow.
- A 60-navigation bilingual static-route probe distinguished authorized theme rendering from the pre-existing direct-route authorization failure in DTA-M-006. Its first `127.0.0.1` attempt was rejected by development host checks; `localhost` authenticated normally. A later administrator saturation attempt ended with `ERR_INSUFFICIENT_RESOURCES` and is not counted as a pass.
- Translation completeness passed with 594 English and 594 Arabic keys. The remaining reported inline locale branch is the intentional `dir` selection in `[locale]/layout.tsx`.
- RTL physical alignment leakage was removed. Radix’s logical `start-0` drawer appears on the Arabic side; focus behavior is direction-independent.

## 8. Accessibility assessment

Corrected controls now provide:

- 44×44px theme and mobile-navigation targets;
- roving radio focus with Arrow/Home/End keys;
- visible focus rings;
- dialog title and semantics;
- focus containment, Escape dismissal, focus restoration, overlay dismissal, and scroll lock;
- localized accessible names;
- logical table alignment;
- non-color text for incomplete allocation state; and
- reduced-motion CSS.

No automated axe dependency was added. Accessibility evidence consists of semantic/source inspection, computed sizes/colors, keyboard/browser tests, and manual visual review. A future independent screen-reader and forced-colors audit remains advisable.

## 9. Functional regression and financial-control assessment

| Invariant | Redesign diff | Evidence/result |
|---|---|---|
| Authentication/session behavior | no auth logic change | auth E2E passed |
| Legal entity / RLS isolation | no migration/RLS change | 53/53 DB tests in each cycle |
| Budget approval and self-approval | no workflow change | E2E and DB controls passed |
| Approved budget immutability | no logic change | DB + concurrency probes passed |
| Posted actual immutability | no migration change | DB control passed |
| Exact allocation reconciliation | test was weakened | adjudicated/corrected in DTA-M-001 |
| Reversal idempotency | test selection changed | self-contained post/reverse test passed |
| Financial calculations | presentation-only diff | 135 unit/integration tests; P6 DB tests passed |
| Imports/exports | presentation-only diff | import security 17/17; export E2E passed |
| Permissions under theme switch | shared tree | viewer save remains disabled in E2E |
| Form state under theme switch | shared tree | entered quantity persisted in E2E |

## 10. Security and dependency assessment

- No RLS, migration, SECURITY DEFINER, grant, server authorization, service-role usage, or production configuration changed in the audited redesign.
- The inline theme script interpolates only a source-controlled storage key and accepts only three literal preferences; no untrusted string reaches `dangerouslySetInnerHTML`.
- Tracked environment inventory contains `.env.example` and the local sync script. Pattern hits were documentation, environment-variable names, server-only admin handling, local Supabase configuration, migration ACL text, and sanitization/test code—not a committed live credential.
- Local known-password users remain behind the explicit loopback/authorization fixture guard.
- `npm audit --json` retry reported 0 Critical, 0 High, 2 Moderate: direct `exceljs` and transitive `uuid`. The offered remediation is semver-major; no unsafe override or forced downgrade was applied.
- DTA-M-007 remains the production CSP decision.

## 11. CI and Windows stability assessment

The Linux CI workflow pins Node 22.18 and Supabase CLI 2.111.0, starts/reset/waits for local Supabase, asserts migration safety, loads guarded fixtures, runs lint/type/i18n/unit/import/database/concurrency/E2E/build, uses Playwright retries `0`, uploads failure/evidence artifacts, and always stops Supabase.

Observed Windows/environment evidence:

1. Initial audited-state `npm ci` failed on an `EPERM` locked native module while a repository Next process was alive; after stopping only those processes, retry passed.
2. Initial E2E command timed out due the real drawer defect, not Windows alone.
3. A route-matrix harness using `127.0.0.1` received dev-host 403 responses; `localhost` passed sign-in.
4. An excessive administrator route probe hit `ERR_INSUFFICIENT_RESOURCES`; it is excluded from pass claims.
5. First full post-correction E2E was 52/53 because rapid full navigations aborted a mount-time server action. Trace evidence showed a POST to `/en/budgets`; the strengthened per-route check waits for those requests and the final full suite passed 53/53.
6. Both audited-state and final builds passed on the first build attempt, so the documented worker-exit issue was not reproduced here.

## 12. Test evidence — first failures and final results

### Audited SHA before correction

| Command/check | First result | Retry/result |
|---|---|---|
| Pre-write gate | Pass | not retried |
| `npm ci` | Fail: Windows `EPERM` file lock | Pass after stopping repo Next processes; 699 packages; 2 Moderate |
| `npm run lint` | Pass, 0 errors / 2 warnings | not retried |
| `npm run typecheck` | Pass | not retried |
| `npm run test` | 20 files, 134 passed | not retried |
| `npm run test:i18n` | EN 587 / AR 587 | not retried |
| `npm run test:import-security` | 17/17 | not retried |
| `npm run test:concurrency` | 4/4, but weak selection | adjudicated and replaced |
| DB cycle 1 reset | Pass | fixture first call failed closed without authorization; authorized call then 53/53 |
| DB cycle 2 | reset + fixtures + 53/53 | all first attempts |
| `npm run test:e2e` | Timeout at 304.1s; drawer close test failed | no blind retry before correction |
| `npm run build` | Pass; 71 pages | dynamic-cookie log noise |
| `npm audit --json` | Network `ECONNRESET` | final retry returned 2 Moderate |

### Corrected working tree

| Command/check | Result |
|---|---|
| `npm ci` | Pass first attempt, 699 packages, 103.3s |
| `npm run lint` | Pass, 0 errors / 2 pre-existing warnings |
| `npm run typecheck` | Pass |
| `npm run test` | 20 files, 135/135 |
| `npm run test:i18n` | EN 594 / AR 594 |
| `npm run test:import-security` | 17/17 |
| `npm run test:concurrency` | 5/5 |
| Database cycle 1 | reset pass; 14 personas; 53/53 |
| Database cycle 2 | reset pass; 14 personas; 53/53 |
| Targeted dual-theme suite | 13/13 first post-correction run |
| Full E2E attempt 1 | 52/53; aborted mount action exposed by new console assertion |
| Targeted route diagnostic | 1/1 after trace-backed stabilization |
| Full E2E final | 53/53, 5.3m, retries 0 |
| `npm run build` | Pass first attempt; 38 routes / 71 pages, 27.5s |
| `npm audit --json` | exit 1 by design: 2 Moderate, no High/Critical |
| `git diff --check` | Pass |

The two lint warnings are unrelated unused imports/constants in `scripts/revenue-db-tests.mjs` and `scripts/start-local-stack.mjs`. Vitest prints a future config-loader warning. These were not suppressed.

## 13. Remaining scaffold and partial-module inventory

| Module/control | Actual state |
|---|---|
| Charts | No Recharts implementation or wrapper; dependency/tokens only |
| Contracts, invoices, payments, credit notes | Tabs render a no-record category; lifecycle UI remains partial |
| `ModulePlaceholderPage` | Unused component remains in source; no app route imports it |
| `docs/KNOWN_LIMITATIONS.md` | Stale item still calls cost-control, performance, administration, and master-data placeholders although implemented routes/workspaces exist |
| Production authentication | Local Supabase Auth only; production IdP/OAuth intentionally deferred |
| pgTAP | Placeholder; executable DB evidence is the JavaScript runner |
| Strict CSP | Nonce/hash integration deferred (DTA-M-007) |

## 14. Corrections made

1. Replaced the mobile drawer with an accessible Radix dialog.
2. Hardened first-paint and storage-denial theme handling.
3. Added radio keyboard behavior and 44px touch targets.
4. Corrected input/destructive contrast and completed semantic chart tokens.
5. Removed raw palette and physical alignment leakage.
6. Localized shell and Actuals labels; fixed missing Actuals key mapping.
7. Surfaced incomplete posted allocation state.
8. Rebuilt the reversal concurrency probe around a self-created reconciled transaction and added a bounded legacy-debt assertion.
9. Added browser coverage for persistence, System changes, invalid/denied storage, cross-tab/history, exact theme surfaces, drawer focus, allocation warnings, permissions, form state, RTL, and responsive overflow.
10. Updated theme documentation to represent charts as a scaffold.
11. Added Next 16’s documented smooth-scroll marker.

## 15. Prioritized follow-up plan

1. **Before production security signoff:** decide CSP nonce/hash integration; configure the production identity provider; remediate DTA-M-006 with localized controlled denial.
2. **Before claiming complete functional coverage:** implement charts and the remaining procurement document lifecycles, then add bilingual/light/dark/permission tests.
3. **Before relying on branch automation:** ensure active feature pushes or the eventual `main` PR run the Linux CI workflow and review all uploaded evidence.
4. **Data-quality follow-up:** remove or formally migrate the six legacy local REST-POS orphan headers only with an approved accounting-data decision; until then keep the bounded assertion and UI warning.
5. **Operational quality:** reduce expected authorization/dynamic-route/shutdown log noise without suppressing genuine failures.
6. **Documentation:** reconcile stale `KNOWN_LIMITATIONS`, implementation-status, and completion-report claims with the repository’s actual module inventory.

## 16. Audit disposition

The dual-theme correction is suitable for code review and conditional merge. It must not be represented as blanket platform completion or production readiness.
