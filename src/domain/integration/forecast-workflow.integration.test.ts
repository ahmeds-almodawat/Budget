import { describe, it, expect, beforeAll } from "vitest";
import {
  forecastApproveAndLock,
  forecastApproveAndSupersede,
  forecastCreateDraft,
  forecastStartReview,
  forecastSubmit,
} from "@/lib/commands";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import {
  CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
} from "@/types/database";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasDb)("forecast workflow integration", () => {
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

  it("runs draft → submit → review → approve → supersede with idempotency", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const financeDb = await createAuthenticatedTestClient("finance");
    const approverDb = await createAuthenticatedTestClient("approver");
    const suffix = Date.now();

    const v1 = await forecastCreateDraft(ownerDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `FC-V1-${suffix}`,
      lines: [{ fiscalPeriodId, forecastAmount: "40000" }],
    });

    await forecastSubmit(ownerDb, v1.entity_id as string);
    await forecastStartReview(financeDb, v1.entity_id as string);
    await forecastApproveAndLock(approverDb, v1.entity_id as string);

    const v2 = await forecastCreateDraft(ownerDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `FC-V2-${suffix}`,
      lines: [{ fiscalPeriodId, forecastAmount: "45000" }],
    });
    await forecastSubmit(ownerDb, v2.entity_id as string);
    await forecastStartReview(financeDb, v2.entity_id as string);

    const idempotencyKey = `forecast-supersede-${suffix}`;
    const supersede = await forecastApproveAndSupersede(approverDb, {
      newForecastVersionId: v2.entity_id as string,
      supersededForecastVersionId: v1.entity_id as string,
      approverComment: "Integration supersede",
      idempotencyKey,
    });
    expect(supersede.entity_id).toBe(v2.entity_id);

    const replay = await forecastApproveAndSupersede(approverDb, {
      newForecastVersionId: v2.entity_id as string,
      supersededForecastVersionId: v1.entity_id as string,
      approverComment: "Integration supersede",
      idempotencyKey,
    });
    expect(replay.entity_id).toBe(v2.entity_id);

    const { data: versions } = await approverDb
      .from("forecast_versions")
      .select("id, approval_status, is_current_approved, superseded_from_id")
      .in("id", [v1.entity_id as string, v2.entity_id as string]);

    const oldVersion = versions?.find((v) => v.id === v1.entity_id);
    const newVersion = versions?.find((v) => v.id === v2.entity_id);
    expect(oldVersion?.approval_status).toBe("superseded");
    expect(oldVersion?.is_current_approved).toBe(false);
    expect(newVersion?.approval_status).toBe("locked");
    expect(newVersion?.is_current_approved).toBe(true);
    expect(newVersion?.superseded_from_id).toBe(v1.entity_id);

    const { count } = await approverDb
      .from("forecast_versions")
      .select("id", { count: "exact", head: true })
      .eq("legal_entity_id", LEGAL_ENTITY_MODAWAT)
      .eq("control_scope_id", CONTROL_SCOPE_HOSPITAL_BUDGET_2027)
      .eq("is_current_approved", true);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("denies preparer self-approval", async () => {
    const ownerDb = await createAuthenticatedTestClient("budgetOwner");
    const suffix = Date.now();
    const draft = await forecastCreateDraft(ownerDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `FC-SOD-${suffix}`,
      lines: [{ fiscalPeriodId, forecastAmount: "10000" }],
    });
    await forecastSubmit(ownerDb, draft.entity_id as string);
    await forecastStartReview(await createAuthenticatedTestClient("finance"), draft.entity_id as string);

    await expect(forecastApproveAndLock(ownerDb, draft.entity_id as string)).rejects.toThrow(
      /Submitter cannot approve|SOD|Forbidden/i,
    );
  });

  it("denies cross-tenant forecast read via RLS", async () => {
    const otherDb = await createAuthenticatedTestClient("otherFinance");
    const { data, error } = await otherDb
      .from("forecast_versions")
      .select("id")
      .eq("legal_entity_id", LEGAL_ENTITY_MODAWAT);
    if (error) {
      expect(error.code).toBe("42501");
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });
});
