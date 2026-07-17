import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ingestion",
    include: ["src/**/*.test.ts"],
  },
});
