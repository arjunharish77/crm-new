const requiredPublicEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function getSupabaseBrowserEnv() {
  const missing = requiredPublicEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase env vars: ${missing.join(", ")}`
    );
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing Supabase env var: SUPABASE_SERVICE_ROLE_KEY");
  }

  return serviceRoleKey;
}
