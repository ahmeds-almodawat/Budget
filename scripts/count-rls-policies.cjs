const pg = require("pg");

async function main() {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:56002/postgres",
  });
  await client.connect();
  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'",
  );
  console.log(`RLS policies (public): ${rows[0].n}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
