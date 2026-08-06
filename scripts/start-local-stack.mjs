#!/usr/bin/env node
/**
 * Start local Supabase without echoing ephemeral credentials to stdout/stderr.
 * Full CLI output is captured to a temporary file and deleted on success.
 * Failures print a sanitized excerpt for CI diagnostics.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeSupabaseLog } from "./sanitize-supabase-log.mjs";

const logDir = mkdtempSync(join(tmpdir(), "supabase-start-"));
const logFile = join(logDir, "start.log");

function cleanup() {
  try {
    rmSync(logDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

const result = spawnSync("supabase", ["start"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
writeFileSync(logFile, combined, "utf8");

if (result.status !== 0) {
  console.error("Local Supabase failed to start. Sanitized diagnostics:");
  console.error(sanitizeSupabaseLog(combined));
  cleanup();
  process.exit(result.status ?? 1);
}

console.log("Local Supabase started successfully.");
cleanup();
