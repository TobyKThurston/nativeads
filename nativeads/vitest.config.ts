import { defineConfig } from "vitest/config";

// Unit tests target pure functions only — node environment, no DOM needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
  },
});
