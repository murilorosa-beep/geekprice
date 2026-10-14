import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "tests/integration/**"],
    env: {
      DATABASE_URL: "postgresql://geekprice:geekprice@localhost:5432/geekprice",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/lib/server-only-shim.ts"),
    },
  },
});
