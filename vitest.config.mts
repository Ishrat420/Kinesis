import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },

  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    // .tsx as well: the error fallbacks are components, and one that throws
    // while rendering has nowhere left to escalate to.
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});