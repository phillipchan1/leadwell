import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["mcp/**/*.test.ts", "src/**/*.test.ts"],
  },
});
