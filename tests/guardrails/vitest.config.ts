import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export default defineConfig({
  test: {
    name: "guardrails",
    root: repositoryRoot,
    include: ["tests/guardrails/**/*.test.ts"],
  },
});
