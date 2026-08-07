import pg from "pg";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  delegationActivate,
  delegationApprove,
  delegationCreateDraft,
  delegationSubmit,
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

  async function resetProcurementPeriodFixture() {
    if (!fiscalPeriodId) return;
    const connectionString =
      process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres";
    const hostname = new URL(connectionString).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") {
      throw new Error("P5 integration fixture reset is restricted to a local database");
    }
    const client = new pg.Client({
      connectionString,
    });
    await client.connect();
    try {
      await client.query(
        `UPDATE public.fiscal_period_module_controls
         SET control_state='open',reopened_at=NULL,reopened_by=NULL,
             soft_closed_at=NULL,soft_closed_by=NULL,
             hard_closed_at=NULL,hard_closed_by=NULL,reopen_reason=NULL,
             updated_at=NOW(),row_version=row_version+1
         WHERE fiscal_period_id=$1::uuid AND legal_entity_id=$2::uuid AND module='procurement'`,
        [fiscalPeriodId, LEGAL_ENTITY_MODAWAT],
      );
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }
    const db = await createAuthenticatedTestClient("finance");
    const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
    fiscalPeriodId = periods[0]?.id ?? "";
    if (!fiscalPeriodId) throw new Error("Fiscal period fixture missing");
    await resetProcurementPeriodFixture();
  });

  afterAll(resetProcurementPeriodFixture);

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

  it("runs delegation draft → submit → approve → activate", async () => {
    const adminDb = await createAuthenticatedTestClient("groupAdmin");
    const approverDb = await createAuthenticatedTestClient("approver");
    const suffix = Date.now();
    const draft = await delegationCreateDraft(adminDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      delegateId: TEST_USER_IDS.finance,
      workflowType: "budget",
      permissionCode: "approve",
      effectiveStart: new Date().toISOString(),
      effectiveEnd: new Date(Date.now() + 86_400_000).toISOString(),
      reason: `Coverage delegation ${suffix}`,
    });
    const id = draft.entity_id as string;
    await delegationSubmit(adminDb, id);
    await delegationApprove(approverDb, id);
    const active = await delegationActivate(adminDb, id);
    expect(active.delegation_status).toBe("active");
  });
});
