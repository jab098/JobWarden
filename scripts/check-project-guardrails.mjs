import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const forbiddenDependencies = [
  "@clerk/nextjs",
  "@pinecone-database/pinecone",
  "@stripe/stripe-js",
  "@upstash/redis",
  "clerk",
  "pinecone",
  "resend",
  "stripe",
];
const forbiddenProductCopy =
  /\b(billing|checkout|premium account|pricing plan|start trial|upgrade plan)\b/i;

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
      violations.push(`${path}: forbidden dependency ${dependency}`);
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
