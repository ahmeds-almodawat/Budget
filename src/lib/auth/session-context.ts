import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAuthContext } from "@/lib/auth/context";
import { ACTIVE_LEGAL_ENTITY_COOKIE, requireActiveLegalEntity } from "@/lib/auth/active-context";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveSessionContext {
  ctx: AuthenticatedUserContext;
  legalEntityId: string;
  db: SupabaseClient;
}

export async function getActiveSession(): Promise<ActiveSessionContext> {
  const ctx = await requireAuthContext();
  const cookieStore = await cookies();
  const legalEntityId = requireActiveLegalEntity(
    ctx,
    cookieStore.get(ACTIVE_LEGAL_ENTITY_COOKIE)?.value,
  );
  const db = await createClient();
  return { ctx, legalEntityId, db };
}

export async function getActiveLegalEntityCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_LEGAL_ENTITY_COOKIE)?.value;
}
