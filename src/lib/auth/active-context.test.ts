import { describe, expect, it } from "vitest";
import {
  requireActiveLegalEntity,
  resolveActiveLegalEntityId,
} from "@/lib/auth/active-context";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

const FIRST_ENTITY = "11111111-1111-1111-1111-111111111102";
const SECOND_ENTITY = "11111111-1111-1111-1111-111111111103";

function groupAdministrator(): AuthenticatedUserContext {
  return {
    userId: "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    email: "group.admin@modawat.local",
    displayName: "Group Administrator",
    profile: {
      id: "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      email: "group.admin@modawat.local",
      full_name_en: "Group Administrator",
      full_name_ar: null,
      preferred_locale: "en",
      status: "active",
    },
    memberships: [
      {
        id: "membership-id",
        organization_id: "11111111-1111-1111-1111-111111111101",
        legal_entity_id: null,
        status: "active",
      },
    ],
    roleAssignments: [],
    roleCodes: ["system_administrator"],
    legalEntityIds: [FIRST_ENTITY, SECOND_ENTITY],
    primaryLegalEntityId: FIRST_ENTITY,
  };
}

describe("active legal-entity context", () => {
  it("uses the authorized primary entity when a multi-entity user has no cookie", () => {
    const ctx = groupAdministrator();
    expect(resolveActiveLegalEntityId(ctx, undefined)).toBe(FIRST_ENTITY);
    expect(requireActiveLegalEntity(ctx, undefined)).toBe(FIRST_ENTITY);
  });

  it("honors an authorized explicit entity and rejects an unauthorized cookie", () => {
    const ctx = groupAdministrator();
    expect(resolveActiveLegalEntityId(ctx, SECOND_ENTITY)).toBe(SECOND_ENTITY);
    expect(() => requireActiveLegalEntity(ctx, "12111111-1111-1111-1111-111111111102")).toThrow(
      "Access denied for this legal entity.",
    );
  });
});
