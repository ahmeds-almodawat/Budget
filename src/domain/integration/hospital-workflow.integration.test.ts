import { describe, it, expect, beforeAll } from "vitest";
import {
  createDraftBudgetVersion,
  transitionBudgetVersion,
  getHospitalBudgetPerformance,
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

describe.skipIf(!hasDb)("hospital budget integration", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }
  });

  it("creates, approves, and reads hospital budget performance with authenticated users", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");

    const monthly = Array.from({ length: 12 }, () => "85000.0000");
    monthly[11] = "85000.0000";

    const version = await createDraftBudgetVersion(ownerDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-${Date.now()}`,
      createdBy: TEST_USER_IDS.budgetOwner,
      lines: [
        {
          organizationUnitId: ORG_UNIT_PHARMACY,
          costNodeId: COST_NODE_INJECTABLE,
          controlAccountId: CONTROL_ACCOUNT_PHARM_INJ,
          plannedAmount: "1020000.0000",
          monthlyAmounts: monthly,
        },
      ],
    });

    await transitionBudgetVersion(ownerDb, {
      budgetVersionId: version.id,
      nextStatus: "submitted",
      actorId: TEST_USER_IDS.budgetOwner,
    });
    await transitionBudgetVersion(financeDb, {
      budgetVersionId: version.id,
      nextStatus: "under_review",
      actorId: TEST_USER_IDS.finance,
    });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "approved",
      actorId: TEST_USER_IDS.approver,
      lockOriginalAmount: "1020000.0000",
    });
    await transitionBudgetVersion(approverDb, {
      budgetVersionId: version.id,
      nextStatus: "locked",
      actorId: TEST_USER_IDS.approver,
    });

    const performance = await getHospitalBudgetPerformance(approverDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
    });

    expect(performance).not.toBeNull();
    expect(Number(performance!.currentApproved)).toBeGreaterThan(0);
  });

  it("denies viewer from creating budget versions", async () => {
    const viewerDb = await createAuthenticatedTestClient("viewer");
    await expect(
      createDraftBudgetVersion(viewerDb, {
        legalEntityId: LEGAL_ENTITY_MODAWAT,
        controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
        fiscalYearId: FISCAL_YEAR_2027,
        versionLabel: `IT-DENY-${Date.now()}`,
        createdBy: TEST_USER_IDS.viewer,
        lines: [
          {
            organizationUnitId: ORG_UNIT_PHARMACY,
            costNodeId: COST_NODE_INJECTABLE,
            plannedAmount: "1000.0000",
            monthlyAmounts: Array(12).fill("83.3333"),
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
