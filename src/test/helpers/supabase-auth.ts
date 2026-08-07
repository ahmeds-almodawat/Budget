import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEST_USER_CREDENTIALS } from "@/test/fixtures/users";

export async function createAuthenticatedTestClient(
  user: keyof typeof TEST_USER_CREDENTIALS = "budgetOwner",
): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:56001";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
  }

  const credentials = TEST_USER_CREDENTIALS[user];
  if (!credentials || typeof credentials === "string") {
    throw new Error(`Unknown test user: ${user}`);
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: TEST_USER_CREDENTIALS.password,
  });
  if (error) {
    throw new Error(`Test sign-in failed for ${credentials.email}: ${error.message}`);
  }

  return client;
}
