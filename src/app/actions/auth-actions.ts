"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { getActiveLegalEntityCookie } from "@/lib/auth/session-context";
import { resolveActiveLegalEntityId } from "@/lib/auth/active-context";

export async function signOutAction(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/auth/sign-in`);
}

export async function getCurrentUserSummary() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data: entities } = await supabase
    .from("legal_entities")
    .select("id, code, name_en, name_ar")
    .in("id", ctx.legalEntityIds)
    .order("code");
  const activeLegalEntityId = resolveActiveLegalEntityId(
    ctx,
    await getActiveLegalEntityCookie(),
  );

  return {
    userId: ctx.userId,
    email: ctx.email,
    displayName: ctx.displayName,
    displayNameAr: ctx.profile.full_name_ar,
    roleCodes: ctx.roleCodes,
    roleAssignments: ctx.roleAssignments,
    legalEntityIds: ctx.legalEntityIds,
    primaryLegalEntityId: ctx.primaryLegalEntityId,
    activeLegalEntityId,
    legalEntities: entities ?? [],
  };
}
