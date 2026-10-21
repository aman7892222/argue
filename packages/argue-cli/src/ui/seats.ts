import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "../atomic-write.js";
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

export type SeatPick = { model?: string; effort?: string };

export type RawConfig = {
  providers?: Record<string, unknown>;
  agents?: Array<{ id: string; provider: string; [key: string]: unknown }>;
  defaults?: { defaultAgents?: string[]; [key: string]: unknown };
  desk?: { theme?: string; seats?: Record<string, SeatPick>; [key: string]: unknown };
  [key: string]: unknown;
};

async function readRaw(configPath: string): Promise<RawConfig> {
  return JSON.parse(await readFile(configPath, "utf8")) as RawConfig;
}

export async function writeValidated(configPath: string, config: RawConfig): Promise<void> {
  // Refuse to write anything argue itself would reject.
  WorkspaceConfigSchema.parse(config);
  await writeFileAtomic(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

const pendingWrites = new Map<string, Promise<unknown>>();

/**
 * Reads, changes and writes the workspace config, one change at a time per file, so two quick
 * saves from the page (say a theme click and a seat pick) cannot overwrite each other.
 */
export function updateConfig(configPath: string, change: (config: RawConfig) => void): Promise<void> {
  const next = (pendingWrites.get(configPath) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const config = await readRaw(configPath);
      change(config);
      await writeValidated(configPath, config);
    });
  pendingWrites.set(configPath, next);
  return next;
}

export function addSeat(configPath: string, seat: AddSeatRequest): Promise<void> {
  return updateConfig(configPath, (config) => {
    config.providers ??= {};
    config.agents ??= [];

    if (config.agents.some((agent) => agent.id === seat.id))
      throw new Error(`A seat named "${seat.id}" already exists.`);

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
  });
}

export function removeSeat(configPath: string, agentId: string): Promise<void> {
  return updateConfig(configPath, (config) => {
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
    // ...and the model and effort last picked for it on the desk.
    if (config.desk?.seats) {
      delete config.desk.seats[agentId];
      if (!Object.keys(config.desk.seats).length) delete config.desk.seats;
    }
  });
}

/** Validates a seat's model/effort pick from the page. Empty values mean "back to the seat's own". */
export function parseSeatPick(
  body: unknown,
  agentIds: string[]
): { ok: true; id: string; pick: SeatPick } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "expected a JSON object" };
  const input = body as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id : "";
  if (!agentIds.includes(id)) return { ok: false, error: "unknown seat" };
  const model = typeof input.model === "string" ? input.model.trim() : "";
  // eslint-disable-next-line no-control-regex
  if (model.length > 200 || /[\u0000-\u001f]/.test(model)) return { ok: false, error: "bad model" };
  const effort = typeof input.effort === "string" ? input.effort.trim() : "";
  if (effort && !/^[a-z]{1,20}$/.test(effort)) return { ok: false, error: "bad effort" };
  return { ok: true, id, pick: { ...(model ? { model } : {}), ...(effort ? { effort } : {}) } };
}

/** Remembers a seat's model/effort pick in the config: the desk opens on a new port each time. */
export function saveSeatPick(configPath: string, id: string, pick: SeatPick): Promise<void> {
  return updateConfig(configPath, (config) => {
    const seats = { ...config.desk?.seats };
    if (pick.model || pick.effort) seats[id] = pick;
    else delete seats[id];
    const desk: NonNullable<RawConfig["desk"]> = { ...config.desk };
    if (Object.keys(seats).length) desk.seats = seats;
    else delete desk.seats;
    if (Object.keys(desk).length) config.desk = desk;
    else delete config.desk;
  });
}
