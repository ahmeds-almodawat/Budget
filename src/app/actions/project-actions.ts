"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  ensureKhamisProjectStructure,
  getProjectDashboard,
} from "@/data/repositories/project-repository";
import { CONTROL_SCOPE_KM_HOSPITAL, LEGAL_ENTITY_MODAWAT } from "@/types/database";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

export async function fetchProjectDashboardAction(projectScopeId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "read", projectScopeId);

    let projectId: string;
    if (projectScopeId === CONTROL_SCOPE_KM_HOSPITAL) {
      projectId = await ensureKhamisProjectStructure(db, ctx.userId);
    } else {
      const { data } = await db
        .from("projects")
        .select("id")
        .eq("control_scope_id", projectScopeId)
        .maybeSingle();
      if (!data) return null;
      projectId = data.id;
    }
    return getProjectDashboard(db, projectId);
  } catch (error) {
    mapActionError(error);
  }
}
