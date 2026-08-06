"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  forecastApproveAndLock,
  forecastCancel,
  forecastCreateDraft,
  forecastReject,
  forecastStartReview,
  forecastSubmit,
  forecastUpdateDraft,
  type ForecastLineInput,
} from "@/lib/commands";
import { FISCAL_YEAR_2027 } from "@/types/database";

export async function fetchForecastsAction() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const { data, error } = await db
      .from("forecast_versions")
      .select("*, forecast_lines(*)")
      .eq("legal_entity_id", legalEntityId)
      .order("created_at", { ascending: false });
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data ?? [];
  });
}

export async function createForecastDraftAction(params: {
  controlScopeId: string;
  versionLabel: string;
  lines: ForecastLineInput[];
  projectId?: string;
  controlAccountId?: string;
  assumptions?: string;
}) {
  return withActivePermission("budget", "create", async ({ legalEntityId, db }) => {
    const result = await forecastCreateDraft(db, {
      legalEntityId,
      controlScopeId: params.controlScopeId,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: params.versionLabel,
      projectId: params.projectId,
      controlAccountId: params.controlAccountId,
      assumptions: params.assumptions,
      lines: params.lines,
    });
    const { data, error } = await db
      .from("forecast_versions")
      .select("*, forecast_lines(*)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return data;
  });
}

export async function updateForecastDraftAction(params: {
  forecastVersionId: string;
  expectedRowVersion: number;
  versionLabel?: string;
  assumptions?: string;
  lines?: ForecastLineInput[];
}) {
  return withActivePermission("budget", "update", async ({ db }) => {
    const result = await forecastUpdateDraft(db, params);
    const { data, error } = await db
      .from("forecast_versions")
      .select("*, forecast_lines(*)")
      .eq("id", params.forecastVersionId)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return { ...data, row_version: result.row_version };
  });
}

export async function submitForecastAction(forecastVersionId: string) {
  return withActivePermission("budget", "update", async ({ db }) => {
    await forecastSubmit(db, forecastVersionId);
    const { data, error } = await db
      .from("forecast_versions")
      .select("*")
      .eq("id", forecastVersionId)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return data;
  });
}

export async function startForecastReviewAction(forecastVersionId: string) {
  return withActivePermission("budget", "update", async ({ db }) => {
    await forecastStartReview(db, forecastVersionId);
    const { data, error } = await db
      .from("forecast_versions")
      .select("*")
      .eq("id", forecastVersionId)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return data;
  });
}

export async function rejectForecastAction(forecastVersionId: string) {
  return withActivePermission("budget", "approve", async ({ db }) => {
    await forecastReject(db, forecastVersionId);
    const { data, error } = await db
      .from("forecast_versions")
      .select("*")
      .eq("id", forecastVersionId)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return data;
  });
}

export async function cancelForecastAction(forecastVersionId: string) {
  return withActivePermission("budget", "update", async ({ db }) => {
    await forecastCancel(db, forecastVersionId);
    const { data, error } = await db
      .from("forecast_versions")
      .select("*")
      .eq("id", forecastVersionId)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return data;
  });
}

export async function approveForecastAction(forecastVersionId: string) {
  return withActivePermission("budget", "approve", async ({ db }) => {
    await forecastApproveAndLock(db, forecastVersionId);
    const { data, error } = await db
      .from("forecast_versions")
      .select("*")
      .eq("id", forecastVersionId)
      .single();
    if (error || !data) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    return data;
  });
}
