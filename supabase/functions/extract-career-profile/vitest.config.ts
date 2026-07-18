import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    alias: {
      "@jobwarden/domain": fileURLToPath(
        new URL("../../../packages/domain/src/index.ts", import.meta.url),
      ),
      "@jobwarden/profile": fileURLToPath(
        new URL("../../../packages/profile/src/index.ts", import.meta.url),
      ),
      fflate: fileURLToPath(
        new URL(
          "../../../packages/profile/node_modules/fflate/esm/browser.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    name: "extract-career-profile-function",
    environment: "node",
    include: ["supabase/functions/extract-career-profile/**/*.test.ts"],
  },
});
