import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    env: { TZ: "Asia/Kolkata", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" },
  },
});
