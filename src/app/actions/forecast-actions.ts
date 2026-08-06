"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { DataAccessError } from "@/data/repositories/budget-repository";
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
  lines: { costNodeId: string; organizationUnitId: string; fiscalPeriodId: string; forecastAmount: string }[];
}) {
  return withActivePermission("budget", "create", async ({ ctx, legalEntityId, db }) => {
    const { data: version, error } = await db
      .from("forecast_versions")
      .insert({
        legal_entity_id: legalEntityId,
        control_scope_id: params.controlScopeId,
        fiscal_year_id: FISCAL_YEAR_2027,
        version_label: params.versionLabel,
        approval_status: "draft",
        is_current_approved: false,
        created_by: ctx.userId,
      })
      .select("*")
      .single();
    if (error) throw new DataAccessError(error.message, "DATABASE");

    if (params.lines.length > 0) {
      const { error: lineError } = await db.from("forecast_lines").insert(
        params.lines.map((line) => ({
          forecast_version_id: version.id,
          cost_node_id: line.costNodeId,
          organization_unit_id: line.organizationUnitId,
          fiscal_period_id: line.fiscalPeriodId,
          forecast_amount: line.forecastAmount,
        })),
      );
      if (lineError) throw new DataAccessError(lineError.message, "DATABASE");
    }

    return version;
  });
}

export async function submitForecastAction(forecastVersionId: string) {
  return withActivePermission("budget", "update", async ({ ctx, db }) => {
    const { data, error } = await db
      .from("forecast_versions")
      .update({
        approval_status: "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by: ctx.userId,
      })
      .eq("id", forecastVersionId)
      .select("*")
      .single();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  });
}

export async function approveForecastAction(forecastVersionId: string) {
  return withActivePermission("budget", "approve", async ({ ctx, db }) => {
    const { data: current } = await db
      .from("forecast_versions")
      .select("legal_entity_id, control_scope_id, submitted_by")
      .eq("id", forecastVersionId)
      .single();
    if (!current) throw new DataAccessError("Forecast version not found.", "NOT_FOUND");
    if (current.submitted_by === ctx.userId) {
      throw new DataAccessError("Requester cannot approve their own forecast.", "FORBIDDEN");
    }

    await db
      .from("forecast_versions")
      .update({ is_current_approved: false })
      .eq("legal_entity_id", current.legal_entity_id)
      .eq("control_scope_id", current.control_scope_id)
      .eq("is_current_approved", true);

    const { data, error } = await db
      .from("forecast_versions")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: ctx.userId,
        is_current_approved: true,
        locked_at: new Date().toISOString(),
      })
      .eq("id", forecastVersionId)
      .select("*")
      .single();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  });
}
