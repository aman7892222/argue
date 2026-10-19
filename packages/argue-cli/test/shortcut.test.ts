import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeDeskShortcut } from "../src/ui/shortcut.js";

describe("desk shortcut", () => {
  it.each([
    ["win32", "Open Debate Desk.cmd", 'cd /d "%~dp0"'],
    ["darwin", "Open Debate Desk.command", 'cd "$(dirname "$0")"'],
    ["linux", "open-debate-desk.sh", 'cd "$(dirname "$0")"']
  ] as const)("writes a %s launcher that starts the desk with auto-shutdown", async (platform, name, cdLine) => {
    const dir = await mkdtemp(join(tmpdir(), `argue-shortcut-${platform}-`));
    const path = await writeDeskShortcut(dir, platform);
    expect(basename(path)).toBe(name);

    const text = await readFile(path, "utf8");
    expect(text).toContain(cdLine);
    expect(text).toContain("ui --exit-when-idle 3");
    expect(text).toMatch(/cli\.js/);
    if (platform !== "win32") {
      expect(text.startsWith("#!/bin/sh\n")).toBe(true);
      if (process.platform !== "win32") expect((await stat(path)).mode & 0o111).not.toBe(0);
    } else {
      expect(text).toContain("\r\n");
    }
  });
});
