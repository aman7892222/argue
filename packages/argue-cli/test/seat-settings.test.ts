import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCodexEffortLevels } from "../src/cli-catalog.js";
import { loadCliConfig, loadWorkspaceConfig } from "../src/config.js";
import { applyAgentOverrides } from "../src/index.js";
import { addSeat, removeSeat } from "../src/ui/seats.js";
import { parseStartRequest } from "../src/ui/server.js";

const TWO_SEATS = {
  schemaVersion: 1,
  providers: {
    claude: { type: "cli", cliType: "claude", models: { opus: {} } },
    mock: { type: "mock", models: { fake: {} } }
  },
  agents: [
    { id: "claude", provider: "claude", model: "opus" },
    { id: "m", provider: "mock", model: "fake" }
  ]
};

async function writeConfig(config: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "argue-seat-settings-"));
  const path = join(dir, "argue.config.json");
  await writeFile(path, JSON.stringify(config));
  return path;
}

describe("per-debate model and effort", () => {
  it("applies --model-for / --effort-for in memory only", async () => {
    const path = await writeConfig(TWO_SEATS);
    const loaded = await loadCliConfig({ explicitPath: path });

    applyAgentOverrides(loaded, { claude: "sonnet" }, { claude: "high" });
    const agent = loaded.config.agents.find((a) => a.id === "claude")!;
    expect(agent.model).toBe("sonnet");
    expect(agent.reasoning).toBe("high");
    expect(loaded.config.providers.claude!.models.sonnet).toEqual({});

    // the file on disk is untouched
    expect(JSON.parse(await readFile(path, "utf8")).agents[0].model).toBe("opus");
    expect(() => applyAgentOverrides(loaded, { nobody: "x" }, undefined)).toThrow(/unknown agent id "nobody"/);
  });

  it("accepts per-seat settings from the desk and rejects unsafe values", async () => {
    const loaded = await loadCliConfig({ explicitPath: await writeConfig(TWO_SEATS) });
    const base = { task: "t", agents: ["claude", "m"] };

    expect(
      parseStartRequest({ ...base, settings: { claude: { model: "sonnet", effort: "max" } } }, loaded)
    ).toMatchObject({
      ok: true,
      value: { settings: { claude: { model: "sonnet", effort: "max" } } }
    });
    expect(parseStartRequest({ ...base, settings: { claude: { model: "a b" } } }, loaded).ok).toBe(false);
    expect(parseStartRequest({ ...base, settings: { claude: { effort: "HIGH; rm" } } }, loaded).ok).toBe(false);
    expect(parseStartRequest({ ...base, settings: { ghost: {} } }, loaded).ok).toBe(false);
  });

  it("reads Codex reasoning levels per picker-visible model", () => {
    const stdout = JSON.stringify({
      models: [
        {
          slug: "gpt-6-astra",
          visibility: "list",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "ultra" }]
        },
        { slug: "gpt-6-luna", visibility: "list", supported_reasoning_levels: ["low", "max"] },
        { slug: "hidden", visibility: "hide", supported_reasoning_levels: ["low"] }
      ]
    });
    expect(parseCodexEffortLevels(stdout)).toEqual({ "gpt-6-astra": ["low", "ultra"], "gpt-6-luna": ["low", "max"] });
    expect(parseCodexEffortLevels("nope")).toEqual({});
  });
});

describe("workspace with fewer than two seats", () => {
  it("lets the desk start empty and add or remove seats one at a time", async () => {
    const path = await writeConfig({ schemaVersion: 1, providers: {}, agents: [] });
    await expect(loadCliConfig({ explicitPath: path })).rejects.toThrow(); // argue run still needs two
    expect((await loadWorkspaceConfig({ explicitPath: path })).config.agents).toEqual([]);

    await addSeat(path, { id: "claude", cliType: "claude", model: "opus" });
    expect((await loadWorkspaceConfig({ explicitPath: path })).config.agents.map((a) => a.id)).toEqual(["claude"]);

    await addSeat(path, { id: "claude-2", cliType: "claude", model: "sonnet" });
    expect((await loadCliConfig({ explicitPath: path })).config.agents).toHaveLength(2);

    await removeSeat(path, "claude-2");
    await removeSeat(path, "claude");
    expect((await loadWorkspaceConfig({ explicitPath: path })).config.providers).toEqual({});
  });
});
