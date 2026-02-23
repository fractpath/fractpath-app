import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("Contract script runner", () => {
  const dir = join(process.cwd(), "src/lib/__tests__");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".contract.ts"))
    .sort();

  it("all contract scripts pass", () => {
    // If there are none, fail loudly so we don't silently stop running contracts.
    expect(files.length).toBeGreaterThan(0);

    const failures: Array<{ file: string; code: number | null }> = [];

    for (const file of files) {
      const full = join(dir, file);

      // Run TypeScript file as a subprocess so contract scripts can keep using process.exit().
      // Assumes `tsx` is available (common in your repos). If not, we’ll switch to a different runner.
      const res = spawnSync("npx", ["-y", "tsx", full], {
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "1" },
      });

      if (res.status !== 0) failures.push({ file, code: res.status });
    }

    expect(failures).toEqual([]);
  });
});
