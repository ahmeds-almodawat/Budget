"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";

export async function signOutAction(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/auth/sign-in`);
}

export async function getCurrentUserSummary() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  return {
    userId: ctx.userId,
    email: ctx.email,
    displayName: ctx.displayName,
    displayNameAr: ctx.profile.full_name_ar,
    roleCodes: ctx.roleCodes,
    legalEntityIds: ctx.legalEntityIds,
    primaryLegalEntityId: ctx.primaryLegalEntityId,
  };
}
