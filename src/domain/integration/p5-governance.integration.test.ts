import { describe, it, expect, beforeAll } from "vitest";
import {
  delegationCreateDraft,
  masterRecordCreateDraft,
  periodSoftClose,
  requisitionCreateDraft,
  requisitionSubmit,
} from "@/lib/commands";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { FISCAL_YEAR_2027, LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";
import { TEST_USER_IDS } from "@/test/fixtures/users";

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasDb)("P5 procurement and governance integration", () => {
  let fiscalPeriodId = "";

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }
    const db = await createAuthenticatedTestClient("finance");
    const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
    fiscalPeriodId = periods[0]?.id ?? "";
    if (!fiscalPeriodId) throw new Error("Fiscal period fixture missing");
  });

  it("creates governed master data draft through RPC", async () => {
    const financeDb = await createAuthenticatedTestClient("finance");
    const suffix = Date.now();
    const result = await masterRecordCreateDraft(financeDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      recordType: "cost_category",
      code: `CC-P5-${suffix}`,
      nameEn: `Category ${suffix}`,
      nameAr: `فئة ${suffix}`,
    });
    expect(result.entity_id).toBeTruthy();
  });

  it("runs requisition draft → submit with period open", async () => {
    const financeDb = await createAuthenticatedTestClient("finance");
    const suffix = Date.now();
    const draft = await requisitionCreateDraft(financeDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      requisitionNumber: `REQ-${suffix}`,
      titleEn: `Requisition ${suffix}`,
      titleAr: `طلب ${suffix}`,
      fiscalPeriodId,
    });
    const submitted = await requisitionSubmit(financeDb, draft.entity_id as string);
    expect(submitted.requisition_status).toBe("submitted");
  });

  it("blocks procurement posting after period soft close", async () => {
    const financeDb = await createAuthenticatedTestClient("finance");
    const suffix = Date.now();
    const closeKey = `soft-close-${suffix}`;
    await periodSoftClose(financeDb, {
      fiscalPeriodId,
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      module: "procurement",
      idempotencyKey: closeKey,
    });

    await expect(
      requisitionCreateDraft(financeDb, {
        legalEntityId: LEGAL_ENTITY_MODAWAT,
        requisitionNumber: `REQ-CLOSED-${suffix}`,
        titleEn: "Should fail",
        titleAr: "يجب أن يفشل",
        fiscalPeriodId,
      }),
    ).rejects.toThrow();

    await financeDb.rpc("rpc_period_hard_close", {
      p_fiscal_period_id: fiscalPeriodId,
      p_legal_entity_id: LEGAL_ENTITY_MODAWAT,
      p_module: "procurement",
      p_expected_state: "soft_close",
      p_idempotency_key: `hard-close-${suffix}`,
      p_correlation_id: null,
    });
    await financeDb.rpc("rpc_period_reopen", {
      p_fiscal_period_id: fiscalPeriodId,
      p_legal_entity_id: LEGAL_ENTITY_MODAWAT,
      p_module: "procurement",
      p_reason: "Integration test reopen",
      p_expected_state: "hard_close",
      p_idempotency_key: `reopen-${suffix}`,
      p_correlation_id: null,
    });
  });

  it("rejects self-delegation", async () => {
    const approverDb = await createAuthenticatedTestClient("approver");
    const delegateId = TEST_USER_IDS.approver;
    await expect(
      delegationCreateDraft(approverDb, {
        legalEntityId: LEGAL_ENTITY_MODAWAT,
        delegateId,
        workflowType: "budget",
        permissionCode: "approve",
        effectiveStart: new Date().toISOString(),
        effectiveEnd: new Date(Date.now() + 86_400_000).toISOString(),
        reason: "Self delegation should fail",
      }),
    ).rejects.toThrow();
  });
});
