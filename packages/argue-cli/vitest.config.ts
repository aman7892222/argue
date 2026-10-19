import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@onevcat/argue": resolve(__dirname, "../argue/src/index.ts")
    }
  },
  test: {
    // Keep runner tests from writing the real ~/.argue/usage.json ledger.
    // Likewise keep usage reads away from the developer's real Codex session logs.
    env: {
      ARGUE_USAGE_FILE: join(tmpdir(), `argue-usage-test-${process.pid}.json`),
      CODEX_HOME: join(tmpdir(), `argue-codex-home-test-${process.pid}`)
    }
  }
});
