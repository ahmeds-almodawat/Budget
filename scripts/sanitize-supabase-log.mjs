#!/usr/bin/env node
/**
 * Redact ephemeral local Supabase credentials from CLI output while preserving
 * actionable startup diagnostics (container names, ports, error messages).
 */

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const KEY_VALUE_PATTERNS = [
  /^(.*\b(anon key|service_role key|JWT secret|secret key|access key|s3 secret key|publishable key|secret key))\s*[:=]\s*.+$/gim,
  /^(.*\b(DB URL|DATABASE_URL|API URL|GRAPHQL URL|STUDIO URL|S3 URL))\s*[:=]\s*.+$/gim,
];

export function sanitizeSupabaseLog(text) {
  let sanitized = text.replace(JWT_PATTERN, "[REDACTED_JWT]");
  for (const pattern of KEY_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, prefix) => `${prefix.trim()}: [REDACTED]`);
  }
  return sanitized.replace(
    /(postgresql:\/\/)([^@\s]+)@/g,
    "$1[REDACTED]@",
  );
}
