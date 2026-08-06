import { describe, it, expect, beforeAll } from "vitest";
import { forecastCreateDraft, forecastSubmit } from "@/lib/commands";
import {
  CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
} from "@/types/database";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasDb)("server action security boundaries (two-entity)", () => {
  let fiscalPeriodId = "";

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required");
    }
    const db = await createAuthenticatedTestClient("finance");
    const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
    fiscalPeriodId = periods[0]?.id ?? "";
  });

  it("entity A finance user can create forecast in entity A", async () => {
    const financeDb = await createAuthenticatedTestClient("finance");
    const result = await forecastCreateDraft(financeDb, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `SEC-A-${Date.now()}`,
      lines: [{ fiscalPeriodId, forecastAmount: "12000" }],
    });
    expect(result.entity_id).toBeTruthy();
  });

  it("entity B finance user cannot create forecast in entity A", async () => {
    const otherDb = await createAuthenticatedTestClient("otherFinance");
    await expect(
      forecastCreateDraft(otherDb, {
        legalEntityId: LEGAL_ENTITY_MODAWAT,
        controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
        fiscalYearId: FISCAL_YEAR_2027,
        versionLabel: `SEC-B-${Date.now()}`,
        lines: [{ fiscalPeriodId, forecastAmount: "12000" }],
      }),
    ).rejects.toThrow(/Forbidden|FORBIDDEN/i);
  });

  it("inactive finance user is denied at RPC layer", async () => {
    const inactiveDb = await createAuthenticatedTestClient("inactiveFinance");
    await expect(
      forecastSubmit(inactiveDb, "00000000-0000-0000-0000-000000000099"),
    ).rejects.toThrow(/Forbidden|UNAUTHENTICATED|Authentication/i);
  });

  it("viewer cannot mutate forecasts", async () => {
    const viewerDb = await createAuthenticatedTestClient("viewer");
    await expect(
      forecastCreateDraft(viewerDb, {
        legalEntityId: LEGAL_ENTITY_MODAWAT,
        controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
        fiscalYearId: FISCAL_YEAR_2027,
        versionLabel: `SEC-V-${Date.now()}`,
        lines: [{ fiscalPeriodId, forecastAmount: "5000" }],
      }),
    ).rejects.toThrow(/Forbidden|FORBIDDEN/i);
  });
});
