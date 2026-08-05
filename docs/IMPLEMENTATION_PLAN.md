# Implementation Plan

## Phases (executed in order)

0. Preflight, scaffold, documentation, migration plan  
1. Foundation: i18n shell, auth schema, OBS, RLS, seed  
2. Control scopes, projects, WBS, milestones  
3. Cost structure, budgets, change control  
4. Actuals, commitments, forecasts, VAT views  
5. EV metrics, dashboards, variance explanations  
6. Governance registers, alerts, advanced approvals  
7. Hardening, full verify, handoff documents  

## Current priority for continuation

1. Apply migrations to local Supabase and wire dashboards to SQL views  
2. Implement budget CRUD + approval workflow UI  
3. Actual import pipeline with reconciliation UI  
4. Complete RLS policies for all domain tables  
5. Playwright scenarios for acceptance tests 1–6  
