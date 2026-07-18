import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "profile",
    include: ["src/**/*.test.ts"],
  },
});
