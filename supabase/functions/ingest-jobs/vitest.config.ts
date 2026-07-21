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
    // `_shared` runs here rather than in all three function configs, so it
    // executes exactly once. It was included by none of them until 2026-07-21,
    // which meant `_shared/env.test.ts` and `_shared/supabase.test.ts` had
    // never run at all — a whole directory of assertions that existed and were
    // never executed.
    include: [
      "supabase/functions/ingest-jobs/**/*.test.ts",
      "supabase/functions/_shared/**/*.test.ts",
    ],
  },
});
