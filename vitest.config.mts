import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "lib/time/**",
        "lib/members/status.ts",
        "lib/pazar/offered-price.ts",
        "lib/auth/username.ts",
        "lib/shifts/format.ts",
        "lib/dashboard/closing.ts",
        "lib/catalog/sort.ts",
        "lib/*/schema.ts",
      ],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
