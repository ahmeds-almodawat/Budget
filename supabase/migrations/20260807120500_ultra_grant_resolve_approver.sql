-- Fix: security_invoker inbox view must be able to call resolver as authenticated
GRANT EXECUTE ON FUNCTION private.resolve_effective_approver(UUID, UUID, TEXT) TO authenticated;
