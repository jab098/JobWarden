import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

/**
 * The checks that need Docker and a real database. Everything else runs in
 * `pnpm verify`; this is what the owner runs after creating the Supabase
 * project. It refuses to pretend when Docker is absent, because a skipped
 * database check reported as a pass is how a broken migration reaches
 * production.
 */
function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\nFailed: ${command} ${args.join(" ")}`);
    process.exit(1);
  }
}

const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
if (docker.status !== 0) {
  console.error(
    "Docker is not available. These checks cannot be simulated: start Docker " +
      "Desktop and run this again. Do not record them as passed.",
  );
  process.exit(1);
}

/**
 * The Supabase CLI is not a dependency of this repository, so it may be a
 * global install or may resolve through npx. Spawning a bare `supabase`
 * assumed the former and produced `Failed: supabase db reset` on a machine
 * where only the latter was true — a resolution problem wearing the costume of
 * a migration failure. Resolve it once, and say which was found.
 */
function resolveSupabase() {
  if (spawnSync("supabase", ["--version"], { stdio: "ignore" }).status === 0) {
    return ["supabase", []];
  }
  const viaNpx = spawnSync("npx", ["--no-install", "supabase", "--version"], {
    stdio: "ignore",
  });
  if (viaNpx.status === 0) return ["npx", ["--no-install", "supabase"]];

  console.error(
    "The Supabase CLI was not found on PATH or in the npx cache. Install it " +
      "(https://supabase.com/docs/guides/local-development) and run this again.",
  );
  process.exit(1);
}

const [cli, cliArgs] = resolveSupabase();

run(cli, [...cliArgs, "db", "reset", "--no-seed"]);
run(cli, [...cliArgs, "db", "lint"]);

const tests = readdirSync("supabase/tests")
  .filter((file) => file.endsWith(".sql"))
  .toSorted();
console.log(`\nRunning ${tests.length} pgTAP files.`);
run(cli, [...cliArgs, "test", "db"]);

console.log("\nLive verification passed.");
