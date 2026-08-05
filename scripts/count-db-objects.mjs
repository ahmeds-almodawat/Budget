import pg from "pg";

const client = new pg.Client(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres",
);

await client.connect();
const policies = await client.query(
  "SELECT count(*)::int AS c FROM pg_policies WHERE schemaname = 'public'",
);
const migrations = await client.query(
  "SELECT count(*)::int AS c FROM supabase_migrations.schema_migrations",
);
console.log(`RLS policies: ${policies.rows[0].c}`);
console.log(`Migrations: ${migrations.rows[0].c}`);
await client.end();
