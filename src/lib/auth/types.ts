import type { RoleAssignment, RoleCode } from "@/domain/auth/permissions";

export interface UserProfile {
  id: string;
  email: string;
  full_name_en: string | null;
  full_name_ar: string | null;
  preferred_locale: string;
  status: string;
}

export interface UserMembership {
  id: string;
  organization_id: string;
  legal_entity_id: string | null;
  status: string;
}

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  profile: UserProfile;
  memberships: UserMembership[];
  roleAssignments: RoleAssignment[];
  roleCodes: RoleCode[];
  legalEntityIds: string[];
  primaryLegalEntityId: string | null;
  displayName: string;
}
