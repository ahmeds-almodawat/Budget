import { createClient } from "@/lib/supabase/server";
import {
  hasPermission,
  type AuthorizationScope,
  type PermissionAction,
  type PermissionResource,
  type RoleAssignment,
  type RoleCode,
} from "@/domain/auth/permissions";
import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext, UserMembership, UserProfile } from "@/lib/auth/types";

function mapRoleAssignments(
  rows: {
    scope_type: RoleAssignment["scopeType"];
    scope_id: string;
    effective_start: string;
    effective_end: string | null;
    roles: { code: string } | { code: string }[] | null;
  }[],
): RoleAssignment[] {
  return rows
    .map((row): RoleAssignment | null => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      if (!role?.code) return null;
      return {
        roleCode: role.code as RoleCode,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        effectiveStart: row.effective_start,
        effectiveEnd: row.effective_end,
      };
    })
    .filter((row): row is RoleAssignment => row !== null);
}

export async function getAuthContext(): Promise<AuthenticatedUserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name_en, full_name_ar, preferred_locale, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return null;
  }
  if (profile.status !== "active") {
    return null;
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, organization_id, legal_entity_id, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  const { data: roleRows } = await supabase
    .from("role_assignments")
    .select("scope_type, scope_id, effective_start, effective_end, roles(code)")
    .eq("user_id", user.id);

  const today = new Date().toISOString().slice(0, 10);
  const effectiveAssignments = mapRoleAssignments(roleRows ?? []).filter(
    (assignment) =>
      (!assignment.effectiveStart || assignment.effectiveStart <= today) &&
      (!assignment.effectiveEnd || assignment.effectiveEnd >= today),
  );

  const { data: accessibleEntities } = await supabase
    .from("legal_entities")
    .select("id, organization_id");

  const legalEntityIds = [
    ...new Set(
      (accessibleEntities ?? []).map((entity) => entity.id),
    ),
  ];
  const roleAssignments = effectiveAssignments.map((assignment) => ({
    ...assignment,
    legalEntityIds:
      assignment.scopeType === "group"
        ? (accessibleEntities ?? [])
            .filter((entity) => entity.organization_id === assignment.scopeId)
            .map((entity) => entity.id)
        : assignment.scopeType === "legal_entity"
          ? [assignment.scopeId]
          : undefined,
  }));
  const roleCodes = [...new Set(roleAssignments.map((r) => r.roleCode))];

  const typedProfile = profile as UserProfile;
  const displayName =
    typedProfile.full_name_en ?? typedProfile.full_name_ar ?? typedProfile.email;

  return {
    userId: user.id,
    email: user.email ?? typedProfile.email,
    profile: typedProfile,
    memberships: (memberships ?? []) as UserMembership[],
    roleAssignments,
    roleCodes,
    legalEntityIds,
    primaryLegalEntityId: legalEntityIds[0] ?? null,
    displayName,
  };
}

export async function requireAuthContext(): Promise<AuthenticatedUserContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new AuthError("Authentication required.", "UNAUTHENTICATED");
  }
  if (ctx.memberships.length === 0) {
    throw new AuthError("No active organization membership.", "NO_MEMBERSHIP");
  }
  return ctx;
}

export function assertLegalEntityAccess(
  ctx: AuthenticatedUserContext,
  legalEntityId: string,
): void {
  if (!ctx.legalEntityIds.includes(legalEntityId)) {
    throw new AuthError("Access denied for this legal entity.", "FORBIDDEN");
  }
}

export function requirePermission(
  ctx: AuthenticatedUserContext,
  resource: PermissionResource,
  action: PermissionAction,
  scope?: string | AuthorizationScope,
): void {
  if (!hasPermission(ctx.roleAssignments, resource, action, scope)) {
    throw new AuthError(`You do not have permission to ${action} ${resource}.`, "FORBIDDEN");
  }
}

export async function getAuthenticatedDb() {
  const ctx = await requireAuthContext();
  const supabase = await createClient();
  return { ctx, db: supabase };
}
