import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{shared,server,web}/**/*.test.{ts,tsx}"],
  },
});
