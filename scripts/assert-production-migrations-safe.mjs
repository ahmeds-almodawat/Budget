#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const forbidden = [
  [/Password123/i, "deterministic development password"],
  [/@modawat\.local/i, "development email domain"],
  [/INSERT\s+INTO\s+auth\.users/i, "direct Auth user insert"],
  [/INSERT\s+INTO\s+auth\.identities/i, "direct Auth identity insert"],
  [/INSERT\s+INTO\s+(?:public\.)?profiles/i, "test profile fixture"],
  [/INSERT\s+INTO\s+(?:public\.)?memberships/i, "test membership fixture"],
  [/INSERT\s+INTO\s+(?:public\.)?role_assignments/i, "test role fixture"],
  [/DELETE\s+FROM/i, "destructive seed cleanup", true],
];

function maskRoutineDefinitions(sql) {
  return sql.replace(
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b[\s\S]*?\bAS\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)[\s\S]*?\1/gi,
    (definition) => " ".repeat(definition.length),
  );
}

const violations = [];
for (const filename of (await readdir(migrationDir)).filter((name) => name.endsWith(".sql"))) {
  const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
  const topLevelSql = maskRoutineDefinitions(sql);
  for (const [pattern, description, topLevelOnly = false] of forbidden) {
    if (pattern.test(topLevelOnly ? topLevelSql : sql)) violations.push(`${filename}: ${description}`);
  }
}
if (violations.length > 0) {
  throw new Error(`Production migration safety scan failed:\n${violations.join("\n")}`);
}

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres";
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query("select count(*)::int as count from auth.users");
  if (rows[0].count !== 0) {
    throw new Error(`Fresh production migration replay created ${rows[0].count} Auth users`);
  }
} finally {
  await client.end();
}

console.log(`Production migration safety passed for ${root}: no fixture data and zero Auth users.`);
