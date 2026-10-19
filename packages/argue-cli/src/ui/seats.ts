import { readFile, writeFile } from "node:fs/promises";
import { catalogId, type KnownCli } from "../cli-catalog.js";
import { CLI_TYPES, defaultCliCommand, WorkspaceConfigSchema, type CliType } from "../config.js";

/** Adding and removing CLI seats (provider + agent) in the workspace config, for the debate desk. */

export type AddSeatRequest = {
  id: string;
  cliType: CliType;
  model: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  permissionMode?: "safe" | "auto";
};

const ID_PATTERN = /^[A-Za-z0-9][\w.-]{0,39}$/;

/**
 * Validates a seat from the page. A `preset` (catalog id such as "ollama") takes its args and
 * env from the server's own catalog, never from the request, so the page cannot inject flags.
 */
export function parseAddSeatRequest(
  body: unknown,
  catalog: KnownCli[] = []
): { ok: true; value: AddSeatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "expected a JSON object" };
  const input = body as Record<string, unknown>;

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!ID_PATTERN.test(id)) {
    return { ok: false, error: "seat name: 1-40 letters, digits, '.', '_' or '-', starting with a letter or digit" };
  }

  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!model || model.length > 200 || /[\r\n]/.test(model)) return { ok: false, error: "model is required" };

  const command = typeof input.command === "string" && input.command.trim() ? input.command.trim() : undefined;

  if (input.preset !== undefined) {
    const preset = catalog.find((cli) => catalogId(cli) === input.preset && cli.presetArgs);
    if (!preset) return { ok: false, error: "unknown CLI preset" };
    return {
      ok: true,
      value: {
        id,
        cliType: "text",
        model,
        command: command ?? preset.command,
        args: [...preset.presetArgs!],
        ...(preset.presetEnv ? { env: { ...preset.presetEnv } } : {}),
        // Recorded so the config says plainly that this CLI approves its own tools.
        ...(preset.unrestricted ? { permissionMode: "auto" as const } : {})
      }
    };
  }

  const cliType = input.cliType;
  if (typeof cliType !== "string" || !(CLI_TYPES as readonly string[]).includes(cliType) || cliType === "generic") {
    return { ok: false, error: "pick a CLI type" };
  }
  if (cliType === "text" && !command) return { ok: false, error: "a custom CLI needs its command" };

  let args: string[] | undefined;
  if (input.args !== undefined) {
    if (!Array.isArray(input.args) || !input.args.every((a) => typeof a === "string")) {
      return { ok: false, error: "args must be a list of strings" };
    }
    args = (input.args as string[]).map((a) => a.trim()).filter(Boolean);
  }

  return {
    ok: true,
    value: { id, cliType: cliType as CliType, model, ...(command ? { command } : {}), ...(args ? { args } : {}) }
  };
}

type RawConfig = {
  providers?: Record<string, unknown>;
  agents?: Array<{ id: string; provider: string; [key: string]: unknown }>;
  defaults?: { defaultAgents?: string[]; [key: string]: unknown };
  [key: string]: unknown;
};

async function readRaw(configPath: string): Promise<RawConfig> {
  return JSON.parse(await readFile(configPath, "utf8")) as RawConfig;
}

export async function writeValidated(configPath: string, config: RawConfig): Promise<void> {
  // Refuse to write anything argue itself would reject.
  WorkspaceConfigSchema.parse(config);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function addSeat(configPath: string, seat: AddSeatRequest): Promise<void> {
  const config = await readRaw(configPath);
  config.providers ??= {};
  config.agents ??= [];

  if (config.agents.some((agent) => agent.id === seat.id)) throw new Error(`A seat named "${seat.id}" already exists.`);

  let providerId = seat.id;
  for (let n = 2; config.providers[providerId]; n++) providerId = `${seat.id}-${n}`;

  config.providers[providerId] = {
    type: "cli",
    cliType: seat.cliType,
    ...(seat.permissionMode ? { permissionMode: seat.permissionMode } : {}),
    command: seat.command ?? defaultCliCommand(seat.cliType),
    args: seat.args ?? [],
    ...(seat.env ? { env: seat.env } : {}),
    models: { [seat.model]: {} }
  };
  config.agents.push({ id: seat.id, provider: providerId, model: seat.model });
  if (config.defaults?.defaultAgents) config.defaults.defaultAgents.push(seat.id);

  await writeValidated(configPath, config);
}

export async function removeSeat(configPath: string, agentId: string): Promise<void> {
  const config = await readRaw(configPath);
  const agents = config.agents ?? [];
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`No seat named "${agentId}".`);

  config.agents = agents.filter((a) => a.id !== agentId);
  // Drop the provider too once no other seat uses it.
  if (config.providers && !config.agents.some((a) => a.provider === agent.provider)) {
    delete config.providers[agent.provider];
  }
  if (config.defaults?.defaultAgents) {
    config.defaults.defaultAgents = config.defaults.defaultAgents.filter((id) => id !== agentId);
  }

  await writeValidated(configPath, config);
}
