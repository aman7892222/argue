import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addProviderCommand,
  detectClis,
  effortLabel,
  findOnPath,
  formatDetectedClis,
  KNOWN_CLIS,
  modelLabel,
  parseCodexModelCatalog,
  parseCodexModelInfo,
  parseTabularModelNames,
  parseTabularModels,
  saveModelsCache,
  withCachedListings,
  type DetectedCli,
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

describe("parseCodexModelCatalog", () => {
  it("keeps picker-visible slugs and tolerates bad input", () => {
    const stdout = JSON.stringify({
      models: [
        { slug: "gpt-6-astra", visibility: "list" },
        { slug: "internal-review", visibility: "hide" },
        { slug: "gpt-5.6-sol", visibility: "list" },
        { display_name: "no slug" }
      ]
    });
    expect(parseCodexModelCatalog(stdout)).toEqual(["gpt-6-astra", "gpt-5.6-sol"]);
    expect(parseCodexModelCatalog("not json")).toEqual([]);
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

describe("model names and effort levels", () => {
  it("reads display names from agy and descriptions from Codex", () => {
    const agy = ["Fetching available models...", "gemini-4-argon-high\tGemini 4 Argon (High)", "lonely-id"].join("\n");
    expect(parseTabularModelNames(agy)).toEqual({ "gemini-4-argon-high": { label: "Gemini 4 Argon (High)" } });

    const codex = JSON.stringify({
      models: [
        {
          slug: "gpt-6-astra",
          display_name: "GPT-6-Astra",
          description: "Frontier intelligence.",
          visibility: "list",
          supported_reasoning_levels: [{ effort: "low", description: "Fast responses" }, { effort: "ultra" }]
        },
        { slug: "internal", display_name: "Internal", visibility: "hide" },
        { slug: "bare", visibility: "list" }
      ]
    });
    expect(parseCodexModelInfo(codex)).toEqual({
      "gpt-6-astra": {
        label: "GPT-6-Astra",
        detail: "Frontier intelligence.",
        effortDetails: { low: "Fast responses" }
      },
      bare: {}
    });
    expect(parseCodexModelInfo("not json")).toEqual({});
  });

  it("offers every current Claude model with the effort levels it accepts", async () => {
    const claude = KNOWN_CLIS.find((c) => c.cliType === "claude")!;
    const [found] = await detectClis({
      catalog: [{ ...claude, command: "missing-claude", knownPaths: [] }],
      list: false
    });
    expect(found!.models.slice(0, 4)).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-fable-5-1"
    ]);
    expect(found!.modelInfo["claude-haiku-5-5"]).toMatchObject({ label: "Haiku 5.5", group: "Latest" });
    expect(found!.effortsByModel["claude-opus-5-5"]).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(found!.effortsByModel["claude-opus-4-6"]).toEqual(["low", "medium", "high", "max"]);
    // Listed with no levels: the desk shows its effort picker disabled.
    expect(found!.effortsByModel["claude-haiku-4-5"]).toEqual([]);

    expect(modelLabel("opus")).toBe("Opus 5.5");
    expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelLabel("gpt-6-astra")).toBe("gpt-6-astra");
    expect(effortLabel("xhigh")).toBe("Extra high");
    expect(effortLabel("ultra")).toBe("Ultra");
  });
});

describe("models cache", () => {
  it("fills quick detections with the last listing, only for the same CLI path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-models-cache-"));
    const file = join(dir, "nested", "models-cache.json");
    const cli: KnownCli = { cliType: "codex", command: "codex", label: "Codex", install: "n/a" };
    const listed: DetectedCli = {
      cli,
      path: "/bin/codex",
      models: ["gpt-6-astra"],
      modelsSource: "listed",
      efforts: [],
      effortsByModel: { "gpt-6-astra": ["low", "ultra"] },
      modelInfo: { "gpt-6-astra": { label: "GPT-6-Astra", effortDetails: { low: "Fast" } } }
    };
    await saveModelsCache(file, [listed]);

    const quick: DetectedCli = { ...listed, models: [], modelsSource: "none", effortsByModel: {}, modelInfo: {} };
    const [filled] = await withCachedListings(file, [quick]);
    expect(filled).toMatchObject({
      models: ["gpt-6-astra"],
      modelsSource: "listed",
      effortsByModel: { "gpt-6-astra": ["low", "ultra"] },
      modelInfo: { "gpt-6-astra": { label: "GPT-6-Astra", effortDetails: { low: "Fast" } } }
    });
    // Moved or reinstalled elsewhere: the old listing is not trusted.
    const moved = { ...quick, path: "/other/codex" };
    expect((await withCachedListings(file, [moved]))[0]).toBe(moved);

    // Malformed entries are ignored, a missing file changes nothing.
    await writeFile(
      file,
      JSON.stringify({ version: 1, listed: { codex: { path: "/bin/codex", models: ["--yolo now"] } } })
    );
    expect((await withCachedListings(file, [quick]))[0]).toBe(quick);
    expect((await withCachedListings(join(dir, "missing.json"), [quick]))[0]).toBe(quick);
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
