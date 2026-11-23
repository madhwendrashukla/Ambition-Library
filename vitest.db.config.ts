import { defineConfig } from "vitest/config";

// Database tests: need a Postgres (local or `supabase start`). See tests/README.md
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
