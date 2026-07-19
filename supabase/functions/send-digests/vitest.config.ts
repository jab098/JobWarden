import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    alias: {
      "@jobwarden/domain": fileURLToPath(
        new URL("../../../packages/domain/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "send-digests-function",
    environment: "node",
    include: ["supabase/functions/send-digests/**/*.test.ts"],
  },
});
