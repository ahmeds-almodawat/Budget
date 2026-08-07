#!/usr/bin/env node
/**
 * Remove transient E2E forecast versions so repeated local/CI runs do not
 * leave locked versions that block first-approval UI paths.
 */
import pg from "pg";

export default async function globalSetup() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres";
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`SET session_replication_role = 'replica'`);
    await client.query(`
      DELETE FROM public.forecast_versions
      WHERE version_label LIKE 'E2E-%'
         OR version_label LIKE 'AR-FC-%'
         OR version_label LIKE 'FC-%'
         OR version_label LIKE 'SEC-%'
    `);
    await client.query(`SET session_replication_role = 'origin'`);
  } finally {
    await client.end();
  }
}
