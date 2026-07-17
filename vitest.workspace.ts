import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "tests/guardrails/vitest.config.ts",
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
    ],
  },
});
