-- Re-apply private function ACLs for functions created after the authorization boundary migration.

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_has_active_membership() TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_access_legal_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_has_any_role(text[], uuid, public.assignment_scope, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_has_role(text, uuid, public.assignment_scope, uuid) TO authenticated;
