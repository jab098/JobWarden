import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const forbiddenDependencies = [
  "@clerk/nextjs",
  "@pinecone-database/pinecone",
  "@stripe/stripe-js",
  "@upstash/redis",
  "clerk",
  "pinecone",
  "stripe",
];
// Task 14 replaced the global Resend ban with this path allowlist. Delivery is
// server-only by construction: the adapter lives in a Supabase Edge Function,
// so it can never reach a client bundle. Any Resend reference elsewhere — a
// client component, another server module, or a workspace package — is a
// violation, whatever form it takes (npm specifier, import, API host, or key
// name).
//
// The list is exact files, not a directory, so the provider stays out of the
// notification function's own orchestration too: contracts, environment,
// repository, and handler are all provider-agnostic and tested as such. Only
// the adapter, its test, and the deployment entry point that wires them may
// name it. The adapter owns its own credential parsing so nothing else needs to.
const notificationAdapterPaths = [
  "supabase/functions/send-digests/resend.ts",
  "supabase/functions/send-digests/resend.test.ts",
  "supabase/functions/send-digests/index.ts",
];
// Matches the provider's *capability* — a dependency, an import path, its API
// host, or its credential — rather than the bare word. Naming Resend in the
// privacy policy's subprocessor list is disclosure, which the product is
// obliged to do; reaching for it in code is what this rule forbids.
// Deliberately not case-insensitive on the dependency form: npm package names
// are lowercase, so `"resend"` is a dependency while `"Resend"` is the provider
// named in the subprocessor list users read.
const resendReference =
  /["']resend["']|npm:resend|from\s+["'][^"']*[Rr]esend[^"']*["']|api\.[Rr]esend\.com|RESEND_[A-Z_]+/;
// No browser analytics SDK may enter the application. This is what keeps the
// privacy policy's "no non-essential cookies" claim true, and it is why no
// consent gate exists yet: there is nothing to consent to.
const forbiddenAnalytics = [
  "@amplitude/analytics-browser",
  "@vercel/analytics",
  "google-analytics",
  "gtag",
  "mixpanel-browser",
  "posthog-js",
];
const forbiddenProductCopy =
  /\b(billing|checkout|payments?|premium|pricing|subscribe|subscriptions?|trial|upgrade)\b/i;

async function walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if ([".next", "node_modules"].includes(entry.name)) continue;
    const child = join(path, entry.name);
    files.push(...(entry.isDirectory() ? await walk(child) : [child]));
  }
  return files;
}

const workspaceFiles = (
  await Promise.all(["apps", "packages", "supabase/functions"].map(walk))
).flat();
const checkedFiles = workspaceFiles.filter((path) =>
  [".json", ".ts", ".tsx"].includes(extname(path)),
);
const dependencyFiles = ["package.json", ...checkedFiles];
const violations = [];

for (const path of dependencyFiles) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (
      path === "package.json" &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      continue;
    throw error;
  }
  for (const dependency of forbiddenDependencies) {
    if (
      source.includes(`\"${dependency}\"`) ||
      source.includes(`'${dependency}'`)
    ) {
      violations.push(`${path}: forbidden dependency ${dependency}`);
    }
  }
  for (const analytics of forbiddenAnalytics) {
    if (
      source.includes(`"${analytics}"`) ||
      source.includes(`'${analytics}'`)
    ) {
      violations.push(`${path}: forbidden browser analytics ${analytics}`);
    }
  }
  if (
    !notificationAdapterPaths.includes(path) &&
    resendReference.test(source)
  ) {
    violations.push(
      `${path}: Resend is permitted only in the server-only notification adapter`,
    );
  }
  if (
    path !== "package.json" &&
    !path.includes(".test.") &&
    forbiddenProductCopy.test(source)
  ) {
    violations.push(`${path}: forbidden pricing copy`);
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Project guardrails passed");
