import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const permanentlyForbiddenDependencies = [
  "@clerk/nextjs",
  "@pinecone-database/pinecone",
  "@stripe/stripe-js",
  "@upstash/redis",
  "clerk",
  "pinecone",
  "stripe",
];
// Resend remains forbidden until Task 14 delivers server-only notifications,
// hard daily/monthly free-tier ceilings, and a path-scoped import guard.
const deferredDependencies = ["resend"];
const forbiddenDependencies = [
  ...permanentlyForbiddenDependencies,
  ...deferredDependencies,
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
  await Promise.all(["apps", "packages"].map(walk))
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
      violations.push(
        `${path}: ${deferredDependencies.includes(dependency) ? "deferred" : "forbidden"} dependency ${dependency}`,
      );
    }
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
