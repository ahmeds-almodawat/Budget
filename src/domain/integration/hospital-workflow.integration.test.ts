import { describe, it, expect, beforeAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
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

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasDb)("hospital budget integration", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY required for integration tests");
    }
  });

  it("creates, approves, and reads hospital budget performance", async () => {
    const db = createAdminClient();
    const monthly = Array.from({ length: 12 }, () => "85000.0000");
    monthly[11] = "85000.0000";

    const version = await createDraftBudgetVersion(db, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `IT-${Date.now()}`,
      createdBy: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
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

    await transitionBudgetVersion(db, {
      budgetVersionId: version.id,
      nextStatus: "submitted",
      actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    });
    await transitionBudgetVersion(db, {
      budgetVersionId: version.id,
      nextStatus: "under_review",
      actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
    });
    await transitionBudgetVersion(db, {
      budgetVersionId: version.id,
      nextStatus: "approved",
      actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
      lockOriginalAmount: "1020000.0000",
    });
    await transitionBudgetVersion(db, {
      budgetVersionId: version.id,
      nextStatus: "locked",
      actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
    });

    const performance = await getHospitalBudgetPerformance(db, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
    });

    expect(performance).not.toBeNull();
    expect(Number(performance!.currentApproved)).toBeGreaterThan(0);
  });
});
