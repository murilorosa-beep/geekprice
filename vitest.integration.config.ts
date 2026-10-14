import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  resolve: { alias: {
    "@": path.resolve(__dirname, "src"),
    "server-only": path.resolve(__dirname, "src/lib/server-only-shim.ts"),
  } },
});
