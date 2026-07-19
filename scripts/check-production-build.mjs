import { spawn } from "node:child_process";

/**
 * Proves the fail-closed development bypass against a real production build
 * rather than only against its unit tests. A build that honoured
 * JOBWARDEN_DEV_ACCESS_BYPASS outside development would serve fictional data
 * and skip the access gate, so this must fail loudly.
 */
function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

const result = await run("pnpm", ["--filter", "@jobwarden/web", "build"], {
  NODE_ENV: "production",
  JOBWARDEN_DEV_ACCESS_BYPASS: "true",
});

if (result.code === 0) {
  console.error(
    "Production build succeeded with JOBWARDEN_DEV_ACCESS_BYPASS=true. " +
      "The bypass must fail closed outside development.",
  );
  process.exit(1);
}

if (!/bypass/i.test(result.output)) {
  console.error(
    "Production build failed, but not with the expected forbidden-bypass " +
      "error. Check that the failure is the access-mode guard and not an " +
      "unrelated build break.",
  );
  console.error(result.output.slice(-2000));
  process.exit(1);
}

console.log(
  "Production guardrail passed: the development bypass fails closed in a " +
    "production build.",
);
