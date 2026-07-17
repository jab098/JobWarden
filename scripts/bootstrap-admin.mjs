import { pathToFileURL } from "node:url";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const requiredVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_BOOTSTRAP_USER_ID",
];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredEnvironment(env) {
  for (const variable of requiredVariables) {
    if (typeof env[variable] !== "string" || env[variable].length === 0) {
      throw new Error(`Missing required environment variable: ${variable}`);
    }
  }

  if (!uuidPattern.test(env.ADMIN_BOOTSTRAP_USER_ID)) {
    throw new Error("ADMIN_BOOTSTRAP_USER_ID must be a UUID");
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    userId: env.ADMIN_BOOTSTRAP_USER_ID,
  };
}

function hasVerifiedIdentity(user) {
  if (typeof user.email_confirmed_at === "string") return true;

  return Array.isArray(user.identities)
    ? user.identities.some((identity) => {
        if (!identity || identity.provider === "email") return false;
        const verified = identity.identity_data?.email_verified;
        return verified === true || verified === "true";
      })
    : false;
}

export async function bootstrapAdmin({
  env = process.env,
  createClient = createSupabaseClient,
  write = (message) => process.stdout.write(`${message}\n`),
} = {}) {
  const { url, serviceRoleKey, userId } = requiredEnvironment(env);
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const identityResult = await supabase.auth.admin.getUserById(userId);
  if (identityResult.error || !identityResult.data?.user) {
    throw new Error("Supabase identity lookup failed");
  }

  const user = identityResult.data.user;
  if (user.id !== userId) {
    throw new Error("Supabase identity lookup returned an unexpected user");
  }

  if (!hasVerifiedIdentity(user)) {
    throw new Error("A verified Supabase identity is required");
  }

  const bootstrapResult = await supabase.rpc("bootstrap_admin", {
    target_user_id: userId,
  });
  if (bootstrapResult.error) {
    throw new Error("Atomic administrator bootstrap failed");
  }

  write("Administrator bootstrap complete.");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (invokedPath === import.meta.url) {
  bootstrapAdmin().catch(() => {
    process.stderr.write("Administrator bootstrap failed.\n");
    process.exitCode = 1;
  });
}
