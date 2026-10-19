import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addProviderCommand,
  detectClis,
  findOnPath,
  formatDetectedClis,
  KNOWN_CLIS,
  parseTabularModels,
  type KnownCli
} from "../src/cli-catalog.js";
import { CLI_TYPES } from "../src/config.js";

describe("parseTabularModels", () => {
  it("takes the first column and skips banners, headings and blanks", () => {
    const stdout = [
      "Fetching available models...",
      "Models:",
      "gemini-4-argon-high\tGemini 4 Argon (High)",
      "",
      "claude-opus-5-5-low   Claude Opus 5.5 (Low)",
      "gemini-4-argon-high\tduplicate"
    ].join("\r\n");

    expect(parseTabularModels(stdout)).toEqual(["gemini-4-argon-high", "claude-opus-5-5-low"]);
  });
});

describe("findOnPath", () => {
  it("resolves Windows commands through PATHEXT", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-find-win-"));
    await writeFile(join(dir, "mycli.cmd"), "");

    const found = await findOnPath("mycli", { PATH: `C:\\nope;${dir}`, PATHEXT: ".EXE;.CMD" }, "win32");
    expect(found).toBe(join(dir, "mycli.cmd"));
  });

  it("returns null when the command is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-find-missing-"));
    expect(await findOnPath("definitely-not-here", { PATH: dir }, "linux")).toBeNull();
  });
});

describe("detectClis", () => {
  it("lists models for installed CLIs and falls back to suggestions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-detect-"));
    const lister = join(dir, "fakeagy.mjs");
    await writeFile(lister, `#!/usr/bin/env node\nprocess.stdout.write("model-a\\tA\\nmodel-b\\tB\\n");\n`, {
      mode: 0o755
    });

    const catalog: KnownCli[] = [
      {
        cliType: "antigravity",
        command: "fakeagy.mjs",
        label: "Fake agy",
        listModelsArgs: ["models"],
        parseModels: parseTabularModels,
        install: "n/a"
      },
      { cliType: "claude", command: "missing-claude", label: "Missing", suggestedModels: ["opus"], install: "get it" }
    ];

    const [agy, claude] = await detectClis({
      catalog,
      // keep node reachable for the fake CLI's shebang
      env: { ...process.env, PATH: `${dir}${delimiter}${dirname(process.execPath)}` }
    });

    expect(agy).toMatchObject({ path: lister, models: ["model-a", "model-b"], modelsSource: "listed" });
    expect(claude).toMatchObject({ path: null, models: ["opus"], modelsSource: "suggested" });

    const text = formatDetectedClis([agy!, claude!]).join("\n");
    expect(text).toContain("--cli-type antigravity --model-id model-a --agent antigravity");
    expect(text).toContain("Missing (missing-claude): get it");
    expect(text).toContain("--cli-type text");
  });
});

describe("KNOWN_CLIS", () => {
  it("only uses real cliTypes and builds add-provider commands", () => {
    for (const cli of KNOWN_CLIS) {
      expect(CLI_TYPES).toContain(cli.cliType);
    }
    const claude = KNOWN_CLIS.find((c) => c.cliType === "claude")!;
    expect(addProviderCommand(claude, "opus")).toBe(
      "argue config add-provider --id claude --type cli --cli-type claude --model-id opus --agent claude"
    );
  });
});

describe("argue models command", () => {
  it("prints the catalog as JSON without running any CLI when --no-list is set", async () => {
    const { runCli } = await import("../src/index.js");
    const logs: string[] = [];
    const result = await runCli(["models", "--json", "--no-list"], {
      log: (m: string) => logs.push(m),
      error: () => {}
    });

    expect(result).toEqual({ ok: true, code: 0 });
    const entries = JSON.parse(logs.join("\n")) as Array<{ cliType: string; installed: boolean }>;
    expect(entries.map((e) => e.cliType)).toEqual(KNOWN_CLIS.map((c) => c.cliType));
  });

  it("rejects unknown options", async () => {
    const { runCli } = await import("../src/index.js");
    const errors: string[] = [];
    const result = await runCli(["models", "--bogus"], { log: () => {}, error: (m: string) => errors.push(m) });

    expect(result).toEqual({ ok: false, code: 1 });
    expect(errors[0]).toContain("Unknown option for models: --bogus");
  });
});
