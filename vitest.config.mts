// DEV-ONLY test runner config (component tests + jsdom setup). Not mirrored to anydoc/.
// See DEV-ONLY-TESTS.md for the sync rules.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Component tests live in __tests__ alongside units; include both .ts and .tsx.
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    globals: false,
  },
});
