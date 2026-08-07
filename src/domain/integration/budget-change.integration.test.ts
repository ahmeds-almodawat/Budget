import { describe, it, expect, beforeAll } from "vitest";
import {
  approveBudgetChangeRequest,
  createBudgetChangeRequest,
  createDraftBudgetVersion,
  transitionBudgetVersion,
} from "@/data/repositories/budget-repository";
import {
  CONTROL_ACCOUNT_PHARM_INJ,
  CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
  COST_NODE_INJECTABLE,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
  ORG_UNIT_PHARMACY,
} from "@/types/database";
import { TEST_USER_IDS } from "@/test/fixtures/users";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasDb)("budget change integration (COD-H-006)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }
  });

  it("approves a valid increase and returns reconciled approved amount", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const approverDb = await createAuthenticatedTestClient("approver");
    const monthly = Array.from({ length: 12 }, () => "10000.0000");

    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `CHG-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: ORG_UNIT_PHARMACY,
          costNodeId: COST_NODE_INJECTABLE,
          controlAccountId: CONTROL_ACCOUNT_PHARM_INJ,
          plannedAmount: "120000.0000",
          monthlyAmounts: monthly,
        },
      ],
    });

    const { data: line } = await ownerDb
      .from("budget_lines")
      .select("id, planned_amount")
      .eq("budget_version_id", version.id)
      .single();

    await transitionBudgetVersion(ownerDb, {
      budgetVersionId: version.id,
      nextStatus: "submitted",
      actorId: TEST_USER_IDS.budgetOwner,
    });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "under_review",
      actorId: TEST_USER_IDS.approver,
    });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "locked",
      actorId: TEST_USER_IDS.approver,
      lockOriginalAmount: "120000.0000",
    });

    const change = await createBudgetChangeRequest(ownerDb, {
      budgetVersionId: version.id,
      changeType: "increase",
      requestedAmount: "5000.0000",
      reason: "Integration test increase",
      requesterId: TEST_USER_IDS.budgetOwner,
      budgetLineId: line!.id,
      beforeAmount: line!.planned_amount,
      afterAmount: "125000.0000",
    });

    const approvedAmount = await approveBudgetChangeRequest(approverDb, {
      changeRequestId: change.id,
      approverId: TEST_USER_IDS.approver,
    });

    expect(Number(approvedAmount)).toBeGreaterThanOrEqual(125000);
  });

  it("rejects requester self-approval at RPC layer", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const { data: change } = await ownerDb
      .from("budget_change_requests")
      .select("id")
      .eq("requester_id", TEST_USER_IDS.budgetOwner)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!change?.id) return;

    await expect(
      approveBudgetChangeRequest(ownerDb, {
        changeRequestId: change.id,
        approverId: TEST_USER_IDS.budgetOwner,
      }),
    ).rejects.toThrow();
  });
});
