#!/usr/bin/env node
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const projectRef = basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:56001";
const healthUrl = new URL("/auth/v1/health", apiUrl);

async function waitForHealth(attempts) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return true;
    } catch {
      // The service is still starting. This is readiness polling, not a test retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

let ready = await waitForHealth(20);

// On Docker Desktop for Windows, `supabase db reset` can replace the Auth
// container while Kong retains its previous container address. Refresh only the
// exact repository-local gateway after readiness has conclusively failed.
if (!ready && process.platform === "win32") {
  const gateway = `supabase_kong_${projectRef}`;
  const inspect = spawnSync("docker.exe", ["inspect", gateway], { encoding: "utf8" });
  if (inspect.status === 0) {
    const restart = spawnSync("docker.exe", ["restart", gateway], {
      encoding: "utf8",
      stdio: "inherit",
    });
    if (restart.status !== 0) process.exit(restart.status ?? 1);
    ready = await waitForHealth(20);
  }
}

if (!ready) {
  console.error(`Local Supabase Auth never became ready at ${healthUrl}`);
  process.exit(1);
}
console.log(`Local Supabase Auth is ready at ${healthUrl}`);
