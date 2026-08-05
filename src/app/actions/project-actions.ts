"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureKhamisProjectStructure,
  getProjectDashboard,
} from "@/data/repositories/project-repository";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";

export async function fetchProjectDashboardAction(projectScopeId: string) {
  const db = createAdminClient();
  let projectId: string;
  if (projectScopeId === CONTROL_SCOPE_KM_HOSPITAL) {
    projectId = await ensureKhamisProjectStructure(db);
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
}
