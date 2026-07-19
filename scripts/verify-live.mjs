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

run("supabase", ["db", "reset", "--no-seed"]);
run("supabase", ["db", "lint"]);

const tests = readdirSync("supabase/tests")
  .filter((file) => file.endsWith(".sql"))
  .toSorted();
console.log(`\nRunning ${tests.length} pgTAP files.`);
run("supabase", ["test", "db"]);

console.log("\nLive verification passed.");
