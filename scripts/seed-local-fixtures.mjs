#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

function refuse(message) {
  console.error(`Local fixture guard refused: ${message}`);
  process.exit(1);
}

if (!process.argv.includes("--confirm-local")) {
  refuse("missing --confirm-local");
}
if (process.env.ALLOW_LOCAL_FIXTURES !== "true") {
  refuse("set ALLOW_LOCAL_FIXTURES=true explicitly");
}

const statusCommand = process.platform === "win32" ? "cmd.exe" : "npx";
const statusArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", "npx supabase status -o json"]
  : ["supabase", "status", "-o", "json"];
const status = spawnSync(statusCommand, statusArgs, {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  encoding: "utf8",
  shell: false,
});
if (status.status !== 0) {
  refuse(`the repository's local Supabase stack is not running (${status.error?.message ?? status.stderr.trim()})`);
}

let localStatus;
try {
  const start = status.stdout.indexOf("{");
  const end = status.stdout.lastIndexOf("}");
  localStatus = JSON.parse(status.stdout.slice(start, end + 1));
} catch {
  refuse("could not verify local Supabase status");
}

const connectionString = process.env.DATABASE_URL ?? localStatus.DB_URL;
const requested = new URL(connectionString);
const verified = new URL(localStatus.DB_URL);
const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
if (!loopback.has(requested.hostname) || requested.href !== verified.href) {
  refuse("DATABASE_URL is not the exact database reported by the local Supabase stack");
}

const fixturePath = fileURLToPath(
  new URL("../supabase/fixtures/local_personas.sql", import.meta.url),
);
const sql = await readFile(fixturePath, "utf8");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    "select count(*)::int as count from auth.users where email like '%@modawat.local'",
  );
  console.log(`Loaded ${rows[0].count} guarded local personas.`);
} finally {
  await client.end();
}
