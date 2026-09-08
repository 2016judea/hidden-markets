import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // The pipeline test drives one SQLite file through a whole experiment;
    // parallel files would race on it.
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
