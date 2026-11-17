import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Unit tests only. Live model evaluations run separately via `npm run eval`.
    include: ["src/**/*.test.{ts,tsx}", "evals/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
