"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth/context";
import { ACTIVE_LEGAL_ENTITY_COOKIE, getMembershipLegalEntityIds } from "@/lib/auth/active-context";
import { AuthError } from "@/lib/auth/errors";
import { toPublicDataAccessError } from "@/lib/errors/safe-error";
import { getLegalEntities } from "@/data/repositories/budget-repository";
import { createClient } from "@/lib/supabase/server";

export async function fetchSelectableLegalEntitiesAction() {
  try {
    const ctx = await requireAuthContext();
    const db = await createClient();
    const entities = await getLegalEntities(db);
    const allowed = new Set(getMembershipLegalEntityIds(ctx));
    return entities.filter((entity) => allowed.has(entity.id));
  } catch (error) {
    throw toPublicDataAccessError(error);
  }
}

export async function setActiveLegalEntityAction(legalEntityId: string) {
  try {
    const ctx = await requireAuthContext();
    const allowed = getMembershipLegalEntityIds(ctx);
    if (!allowed.includes(legalEntityId)) {
      throw new AuthError("Access denied for this legal entity.", "FORBIDDEN");
    }
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_LEGAL_ENTITY_COOKIE, legalEntityId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    revalidatePath("/", "layout");
    return { ok: true as const, legalEntityId };
  } catch (error) {
    throw toPublicDataAccessError(error);
  }
}

export async function getActiveLegalEntityIdAction(): Promise<string | null> {
  try {
    const ctx = await requireAuthContext();
    const cookieStore = await cookies();
    const { resolveActiveLegalEntityId } = await import("@/lib/auth/active-context");
    return resolveActiveLegalEntityId(ctx, cookieStore.get(ACTIVE_LEGAL_ENTITY_COOKIE)?.value);
  } catch {
    return null;
  }
}
