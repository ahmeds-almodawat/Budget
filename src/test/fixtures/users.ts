/**
 * Deterministic local seed user IDs — for automated tests only.
 * See supabase/migrations/20260805120800_workflow_seed_users.sql
 */
export const TEST_USER_IDS = {
  budgetOwner: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  approver: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
  finance: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
  auditor: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
  viewer: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
  projectManager: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6",
  noMembership: "ffffffff-ffff-ffff-ffff-ffffffffffff",
} as const;

export const TEST_USER_CREDENTIALS = {
  password: "Password123!",
  budgetOwner: { email: "budget.owner@modawat.local", id: TEST_USER_IDS.budgetOwner },
  approver: { email: "approver@modawat.local", id: TEST_USER_IDS.approver },
  finance: { email: "finance@modawat.local", id: TEST_USER_IDS.finance },
  auditor: { email: "auditor@modawat.local", id: TEST_USER_IDS.auditor },
  viewer: { email: "viewer@modawat.local", id: TEST_USER_IDS.viewer },
  projectManager: { email: "pm@modawat.local", id: TEST_USER_IDS.projectManager },
} as const;

export const TEST_LEGAL_ENTITY_MODAWAT = "11111111-1111-1111-1111-111111111102";
export const TEST_CONTROL_SCOPE_HOSPITAL = "55555555-5555-5555-5555-555555555501";
