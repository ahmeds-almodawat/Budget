# Production configuration matrix

**Repository:** `ahmeds-almodawat/Budget`
**Audited main:** `69d9a5bcf116ce9a6f9788c0afd3c9674075c89f`
**Readiness branch:** `prod/production-readiness`
**Mode:** configuration design only; no production system was accessed or changed

This document defines the production configuration contract. Values shown as
`<operator-supplied>` are placeholders, not deployable defaults. No actual
secret belongs in this file or any tracked `.env*` file.

## Classification

| Classification | Meaning |
|---|---|
| `READY` | Repository evidence is sufficient for this control. |
| `REQUIRES CONFIGURATION` | Implementation exists, but the hosted value or integration must be configured and verified. |
| `REQUIRES OPERATOR DECISION` | A named owner must select the policy/provider/value before configuration. |
| `BLOCKER` | Production promotion must not proceed. |
| `INTENTIONALLY DEFERRED` | Explicitly excluded from the launch boundary and not represented as implemented. |

## Runtime and operational environment variables

| Variable | Required | Exposure | Source / scope | Production value owner | Secret | Rotation / change control | Status |
|---|---:|---|---|---|---:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client and server | Hosted Supabase project API URL; Production environment only | Platform owner | No | Change only with an approved project/cutover; rebuild and retest | `REQUIRES CONFIGURATION` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client and server | Supabase publishable/legacy anon key for the production project | Platform/security owner | No, but controlled | Rotate with Supabase key rotation; rebuild because `NEXT_PUBLIC_*` is bundled | `REQUIRES CONFIGURATION` |
| `SUPABASE_SERVICE_ROLE_KEY` | No for current runtime | Server only | `src/lib/supabase/admin.ts` defines a client, but repository search found no runtime caller | Security/DBA | Yes | Do not configure in Vercel unless an approved server-only administration path requires it; rotate immediately on suspected disclosure | `REQUIRES OPERATOR DECISION` |
| `NEXT_PUBLIC_APP_URL` | Recommended | Client and server | Canonical `https://<production-domain>`; currently present in `.env.example` but not consumed by application code | Product/platform owner | No | Change with domain cutover; keep aligned with Auth Site URL | `REQUIRES CONFIGURATION` |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | No at runtime today | Client | Present in templates; routing currently defines the effective locale behavior in code | Product owner | No | Normal release change | `READY` with documentation mismatch |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | No at runtime today | Client | Present in templates; current effective defaults are also encoded in schema/code | Finance/product owner | No | Treat any future activation as a financial/date behavior change | `REQUIRES OPERATOR DECISION` |
| `NEXT_PUBLIC_DEFAULT_CURRENCY` | No at runtime today | Client | Present in templates; currency behavior is not driven by this variable today | Finance owner | No | Treat any future activation as a controlled financial change | `REQUIRES OPERATOR DECISION` |
| `NEXT_PUBLIC_DEFAULT_FINANCIAL_YEAR_START_MONTH` | No at runtime today | Client | Present in templates; fiscal periods are authoritative database records | Finance owner | No | Must never replace approved fiscal-period master data | `READY` as non-authoritative only |
| `DATABASE_URL` | Local/CI only | Server/tooling | Integration tests and local migration-safety scripts | Engineering/CI owner | Yes in non-local environments | Must not be configured in Vercel runtime; use an isolated local/CI database only | `READY` for local use; prohibited in production runtime |
| `ALLOW_LOCAL_FIXTURES` | Local/CI only | Tooling | Explicit guard for `db:fixtures:local` | Engineering/CI owner | No | Must be absent from Production and Preview | `READY` guard; production prohibition |
| `CI` | CI only | Tooling | GitHub Actions/Playwright behavior | Engineering owner | No | CI configuration only | `READY` |
| `E2E_PORT` | CI/local only | Tooling | Playwright web server | Engineering owner | No | CI configuration only | `READY` |
| `VERCEL_TOKEN` | Only for custom deployment CI | CI secret | Vercel CLI authentication; not needed for normal Git integration | Platform owner | Yes | Shortest practical lifetime; revoke on role change or disclosure | `REQUIRES OPERATOR DECISION` |
| `VERCEL_ORG_ID` | Only for custom deployment CI | CI | Linked Vercel organization identifier | Platform owner | No, controlled | Change with project ownership | `REQUIRES OPERATOR DECISION` |
| `VERCEL_PROJECT_ID` | Only for custom deployment CI | CI | Linked Vercel project identifier | Platform owner | No, controlled | Change with project relink | `REQUIRES OPERATOR DECISION` |

Provider-specific monitoring, SMTP, malware scanning, or object-storage variables
are deliberately not invented here. Add them only after the provider decision,
using server-only names and Production/Preview scoping appropriate to the chosen
integration.

### Environment separation rules

1. Production and Preview must use different Supabase projects and credentials.
2. Preview must never receive production database, Auth, SMTP, storage, or
   monitoring write credentials.
3. `.env.local` is local-only and gitignored. `vercel env pull` must never be
   used to copy Production secrets to an unmanaged workstation.
4. Any `NEXT_PUBLIC_*` value is browser-visible and must not contain a secret.
5. Environment-variable changes require a new Vercel deployment; a rollback to
   an old build does not itself undo hosted environment changes.

## Supabase Auth configuration

The tracked `supabase/config.toml` is a local development profile, not a
production policy. Its signup, password, confirmation, redirect, SMTP, and MFA
values must not be promoted unchanged.

| Setting | Repository/local evidence | Required production state | Owner | Status |
|---|---|---|---|---|
| Site URL | `http://127.0.0.1:3000` | Exact canonical `https://<production-domain>` | Platform + identity owner | `REQUIRES CONFIGURATION` |
| Redirect allowlist | Local loopback only | Exact `https://<production-domain>/auth/callback`; add separately approved staging callbacks only | Identity owner | `REQUIRES CONFIGURATION` |
| Email/password | UI currently implements password sign-in | Decide whether to retain as invite-only fallback or replace with corporate SSO | Security + identity owner | `REQUIRES OPERATOR DECISION` |
| Public signup | Local `enable_signup = true` | Disabled for enterprise production unless a separately approved enrollment process exists | Security owner | `BLOCKER` until decided/configured |
| Password policy | Local minimum 6, no complexity | If retained: minimum 12, breached-password controls where available, rate limits/CAPTCHA, secure recovery | Security owner | `BLOCKER` until decided/configured |
| Email confirmation | Local disabled | Required for password identities unless the identity is administrator-invited and verified under an approved process | Identity owner | `REQUIRES OPERATOR DECISION` |
| Secure password change | Local disabled | Enable recent-authentication requirement | Security owner | `REQUIRES CONFIGURATION` |
| JWT lifetime | Local 3600 seconds | Keep short; 15–60 minutes based on risk and support requirements | Security owner | `REQUIRES OPERATOR DECISION` |
| Session timebox/inactivity | Not configured | Recommended 12-hour maximum and 30-minute inactivity for privileged financial users, subject to business decision | Security + business owner | `REQUIRES OPERATOR DECISION` |
| MFA | TOTP/phone disabled; no application enrollment/challenge flow | Require AAL2 for administrators, finance approvers, auditors, and payment approvers; implement and test the application flow first | Security + application owner | `BLOCKER` for privileged production use |
| SSO/IdP | No provider or SSO UI configured | Prefer corporate SAML/OIDC; document domains, claims, lifecycle, break-glass access, and offboarding | Identity owner | `BLOCKER` until launch identity model is selected |
| SMTP | Local inbox only; provider commented out | Custom production SMTP for invitation, recovery, and security emails; verify SPF/DKIM/DMARC and templates | Identity + communications owner | `BLOCKER` if password/invite flows are retained |
| Anonymous sign-in | Disabled | Keep disabled | Security owner | `READY` in repository intent; verify hosted state |
| SMS sign-in | Disabled | Keep disabled unless separately approved | Security owner | `READY` in repository intent; verify hosted state |
| CAPTCHA/rate limiting | No production provider | Enable appropriate bot protection and set production rate limits if password sign-in remains | Security owner | `REQUIRES CONFIGURATION` |
| User provisioning | No production admin UI or automatic profile trigger | Approved invite/SSO onboarding plus controlled profile, membership, and scoped-role provisioning | Identity + application owner | `BLOCKER` |
| Initial administrator | No production bootstrap command | Dual-controlled bootstrap described in the deployment runbook; no deterministic account or password | Security + DBA | `BLOCKER` until rehearsed |

Supabase session controls are enforced on token refresh rather than proactively;
the JWT lifetime therefore forms part of the maximum effective timeout. See the
[Supabase session guide](https://supabase.com/docs/guides/auth/sessions) and
[MFA guide](https://supabase.com/docs/guides/auth/auth-mfa).

## Vercel configuration

No tracked `vercel.json` and no local `.vercel/project.json` were present during
the audit. The repository cannot prove any hosted Vercel setting.

| Setting | Required value/control | Status |
|---|---|---|
| Project link and owner | Approved organization/project with least-privilege team access and MFA | `REQUIRES CONFIGURATION` |
| Framework | Next.js, repository root | `READY` for detection; verify hosted setting |
| Node.js | 22.x, aligned with CI (`22.18.0`) and `.nvmrc` (`22`) | `REQUIRES CONFIGURATION` |
| Install command | `npm ci` | `REQUIRES CONFIGURATION` |
| Build command | `npm run build` | `READY`; verify hosted setting |
| Output | Next.js default `.next` | `READY` |
| Production branch | `main` | `REQUIRES CONFIGURATION` |
| Deployment mode | Staged production build with production-domain auto-assignment disabled until DB/Auth/smoke gates pass | `REQUIRES OPERATOR DECISION` |
| Production domain/DNS/TLS | Approved canonical domain, managed DNS ownership, valid TLS | `BLOCKER` until supplied and verified |
| Preview protection | Require authentication; never expose real tenant data | `REQUIRES CONFIGURATION` |
| Production/Preview variables | Separate, least privilege, no production credentials in Preview | `BLOCKER` until verified |
| Redirects | Root locale redirect is application code; no hosted redirect inventory exists | `REQUIRES CONFIGURATION` |
| Security headers/CSP | Not implemented | `BLOCKER` |
| Deployment retention | Retain at least one known-good production deployment compatible with the target schema | `REQUIRES CONFIGURATION` |

## Strict CSP and origin allowlist

**Decision:** use a per-request nonce through the Next.js 16 Proxy for this
sensitive authenticated platform. Hashing only the theme initializer is not
sufficient for framework scripts, and Next.js SRI remains experimental. The
nonce approach requires dynamic rendering and must be performance-tested.

The current inline `themeInitScript` has no nonce and the current Proxy emits no
CSP. Do not add `'unsafe-inline'` to avoid integration work.

| Directive | Production allowlist | Reason / owner decision |
|---|---|---|
| `default-src` | `'self'` | Default deny outside the application origin |
| `script-src` | `'self' 'nonce-<per-request>' 'strict-dynamic'` | Next.js and the inline theme initializer |
| `style-src` | `'self' 'nonce-<per-request>'` after browser verification | Next.js styles; do not use unrestricted inline styles |
| `connect-src` | `'self' https://<project-ref>.supabase.co` and `wss://<project-ref>.supabase.co` only if Realtime is actually used | Supabase Auth/Data API; Realtime origin should be omitted if unused |
| `img-src` | `'self' data: blob:` | Current local assets and safe generated images |
| `font-src` | `'self'` | `next/font` self-hosts the selected fonts in the build |
| `object-src` | `'none'` | No plugin/object requirement |
| `base-uri` | `'self'` | Prevent base-tag injection |
| `form-action` | `'self'` | Current authentication uses client API calls |
| `frame-ancestors` | `'none'` | Prevent clickjacking |
| `frame-src` | `'none'` until an approved provider requires it | No current iframe requirement |
| `worker-src` | `'self' blob:` only if verified necessary | Browser worker behavior |
| `upgrade-insecure-requests` | Enabled in production | HTTPS enforcement |

Do not pre-authorize analytics, monitoring, storage, font CDNs, or identity
origins. Add the exact origin only when a selected integration proves it is
required. Also configure HSTS, `X-Content-Type-Options: nosniff`, a restrictive
Referrer Policy, and an approved Permissions Policy.

## Storage and email

| Capability | Current behavior | Production requirement | Status |
|---|---|---|---|
| Progress evidence | Stores a text description and synthetic filename in database rows | Either relabel as text evidence or implement private object storage, retention, malware scanning, size/type limits, and signed access | `REQUIRES OPERATOR DECISION` |
| Period-close evidence | Stores a text reference | Define authoritative evidence location and retention; do not represent it as an uploaded attachment | `REQUIRES OPERATOR DECISION` |
| Supabase Storage | Local service enabled, but no buckets, bucket policies, or application API use | Required only if real attachments are in launch scope | `INTENTIONALLY DEFERRED` unless attachments are required |
| External object storage | None | Provider, region, encryption, lifecycle, backup, access logs, malware scanning | `INTENTIONALLY DEFERRED` unless attachments are required |
| Auth email | Local inbox; no custom SMTP | Required for invites/recovery/security notifications if password identities remain | `BLOCKER` pending identity decision |
| Business email notifications | In-app database notifications only | External delivery provider and event policy are not implemented | `INTENTIONALLY DEFERRED` |

Database backups do not restore deleted Storage objects; any future object store
needs its own versioning, retention, and restore procedure.

## Monitoring configuration

| Signal | Minimum launch control | Status |
|---|---|---|
| Application/client errors | Central error tracker with release SHA, environment, route, correlation ID, and PII/financial-value redaction | `BLOCKER` |
| Server errors/actions | Vercel runtime logs drained to retained central logging; alert on sustained 5xx and action failures | `BLOCKER` |
| Database/API errors | Supabase Postgres, Auth, and API logs sent to a retained drain; alert on connection, lock, RLS, and RPC failure rates | `BLOCKER` |
| Auth failures | Alert on abnormal failed sign-in, recovery, MFA, and invitation activity without logging credentials/tokens | `BLOCKER` |
| Slow requests/queries | Vercel latency plus Supabase query performance monitoring and reviewed thresholds | `REQUIRES CONFIGURATION` |
| Migration failures | Operator-captured dry-run/apply logs and immediate paging during change window | `BLOCKER` until runbook rehearsal |
| Failed jobs | No scheduled jobs exist today; add monitoring with any future scheduler | `INTENTIONALLY DEFERRED` |
| Security events | Centralized Auth/WAF/application security alerts plus audit-event monitoring | `BLOCKER` |
| Audit evidence | Database append-only controls exist; define retention, export, independent access, and tamper-evidence review | `REQUIRES CONFIGURATION` |
| Uptime | External synthetic checks for public sign-in and authenticated non-mutating health journey | `BLOCKER` |

## Required operator decisions

1. New empty Supabase project versus promotion into an existing database.
2. Corporate SSO/IdP versus invite-only email/password fallback.
3. MFA groups, session timebox, inactivity timeout, and break-glass policy.
4. Canonical domain, Vercel plan/project, staged-promotion mechanism, and
   preview protection.
5. Supabase plan, region, compute size, network restrictions, backup retention,
   and PITR requirement.
6. Central monitoring/log-drain, incident paging, retention, and data-redaction
   providers.
7. Whether real attachments are required at launch; if yes, storage and malware
   controls become blockers.
8. Auth SMTP provider and sender-domain ownership if email identities remain.
9. Approval-rule retention remediation before financial workflows are enabled.
10. Formal acceptance owner and expiry date for the two Moderate
    `exceljs -> uuid` advisories.
