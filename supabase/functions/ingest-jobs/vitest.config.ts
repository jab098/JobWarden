import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    alias: {
      "@jobwarden/domain": fileURLToPath(
        new URL("../../../packages/domain/src/index.ts", import.meta.url),
      ),
      "@jobwarden/ingestion": fileURLToPath(
        new URL("../../../packages/ingestion/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "ingest-jobs-function",
    environment: "node",
    include: ["supabase/functions/ingest-jobs/**/*.test.ts"],
  },
});
