import { access, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import spawn from "cross-spawn";
import { writeFileAtomic } from "./atomic-write.js";
import type { CliType } from "./config.js";

/** What the desk shows for a model in its pickers. */
export interface ModelInfo {
  /** Display name, e.g. "Opus 5.5". */
  label?: string;
  /** One line under the name, e.g. "Latest Haiku: fastest and lightest". */
  detail?: string;
  /** Heading the model is listed under, e.g. "Earlier models". */
  group?: string;
  /** Effort levels this model accepts; an empty list means it has no effort setting. */
  efforts?: string[];
  /** One line per effort level, when the CLI describes them (Codex does). */
  effortDetails?: Record<string, string>;
}

/** A known agent CLI that argue can seat as a participant. */
export interface KnownCli {
  cliType: Exclude<CliType, "generic">;
  /** Unique catalog id; defaults to cliType. `text` presets use their command name. */
  id?: string;
  /** For `text` presets: templated args/env that make the CLI answer once without acting. */
  presetArgs?: string[];
  presetEnv?: Record<string, string>;
  /** Set when the CLI approves its own tool use in script mode, so argue cannot make it read-only. */
  unrestricted?: string;
  /** Preset flags taken from the CLI's docs but not yet run against a real install. */
  unverified?: boolean;
  command: string;
  label: string;
  /** Args that print the CLI's model list. Only set where the output format is verified. */
  listModelsArgs?: string[];
  parseModels?: (stdout: string) => string[];
  /** Model ids/aliases to suggest when the CLI cannot list its own models. */
  suggestedModels?: string[];
  /** Effort (reasoning) levels the CLI accepts for every model. */
  efforts?: string[];
  /** Per-model effort levels parsed from the model listing (overrides `efforts`). */
  parseEfforts?: (stdout: string) => Record<string, string[]>;
  /** Effort is part of the model id (gemini-4-argon-high), so the desk shows it as model + effort. */
  effortInModelName?: boolean;
  /** Names, details and effort levels for known model ids (overridden by `parseModelInfo`). */
  modelInfo?: Record<string, ModelInfo>;
  /** Names and details read from the model listing. */
  parseModelInfo?: (stdout: string) => Record<string, ModelInfo>;
  /** Aliases the CLI accepts and the model each one means today (opus -> claude-opus-5-5). */
  modelAliases?: Record<string, string>;
  /** Shown when the CLI cannot list models (where to find valid ids). */
  modelHint?: string;
  install: string;
  note?: string;
  /** Standard install locations to try when the command is not on PATH ({home}, {localappdata}). */
  knownPaths?: string[];
}

const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const LATEST = "Latest";
const EARLIER = "Earlier models";

/** Claude models Claude Code accepts by full id, with the effort levels each one supports. */
const CLAUDE_MODELS: Record<string, ModelInfo> = {
  "claude-opus-5-5": {
    label: "Opus 5.5",
    detail: "Latest Opus: deep reasoning for hard problems",
    group: LATEST,
    efforts: CLAUDE_EFFORTS
  },
  "claude-sonnet-5-5": {
    label: "Sonnet 5.5",
    detail: "Latest Sonnet: fast, for everyday work",
    group: LATEST,
    efforts: CLAUDE_EFFORTS
  },
  "claude-haiku-5-5": {
    label: "Haiku 5.5",
    detail: "Latest Haiku: fastest and lightest",
    group: LATEST,
    efforts: CLAUDE_EFFORTS
  },
  "claude-fable-5-1": {
    label: "Fable 5.1",
    detail: "Most capable; may bill extra usage credits on some plans",
    group: LATEST,
    efforts: CLAUDE_EFFORTS
  },
  "claude-opus-5": { label: "Opus 5", group: EARLIER, efforts: CLAUDE_EFFORTS },
  "claude-sonnet-5": { label: "Sonnet 5", group: EARLIER, efforts: CLAUDE_EFFORTS },
  "claude-fable-5": {
    label: "Fable 5",
    detail: "May bill extra usage credits on some plans",
    group: EARLIER,
    efforts: CLAUDE_EFFORTS
  },
  "claude-opus-4-8": { label: "Opus 4.8", group: EARLIER, efforts: CLAUDE_EFFORTS },
  "claude-opus-4-7": { label: "Opus 4.7", group: EARLIER, efforts: CLAUDE_EFFORTS },
  // Extra high (xhigh) arrived with Opus 4.7.
  "claude-opus-4-6": { label: "Opus 4.6", group: EARLIER, efforts: ["low", "medium", "high", "max"] },
  "claude-sonnet-4-6": { label: "Sonnet 4.6", group: EARLIER, efforts: ["low", "medium", "high", "max"] },
  "claude-haiku-4-5": { label: "Haiku 4.5", detail: "No effort setting", group: EARLIER, efforts: [] }
};

export const KNOWN_CLIS: KnownCli[] = [
  {
    cliType: "claude",
    command: "claude",
    label: "Claude Code",
    // Claude Code cannot list its models, so this is the current lineup (full ids pin a version).
    suggestedModels: Object.keys(CLAUDE_MODELS),
    modelInfo: CLAUDE_MODELS,
    modelAliases: {
      opus: "claude-opus-5-5",
      sonnet: "claude-sonnet-5-5",
      haiku: "claude-haiku-5-5",
      fable: "claude-fable-5-1"
    },
    efforts: CLAUDE_EFFORTS,
    // The native installer puts claude here without always adding it to PATH.
    knownPaths: ["{home}/.local/bin/claude.exe", "{home}/.local/bin/claude"],
    install: "irm https://claude.ai/install.ps1 | iex  (macOS/Linux: curl -fsSL https://claude.ai/install.sh | bash)",
    note: "fable may bill usage credits on some plans"
  },
  {
    cliType: "codex",
    command: "codex",
    label: "OpenAI Codex",
    listModelsArgs: ["debug", "models"],
    parseModels: parseCodexModelCatalog,
    parseEfforts: parseCodexEffortLevels,
    parseModelInfo: parseCodexModelInfo,
    modelHint: "run `codex` and use /model to see ids available on your plan",
    install: "npm install -g @openai/codex@latest, then `codex login`"
  },
  {
    cliType: "antigravity",
    command: "agy",
    label: "Google Antigravity",
    listModelsArgs: ["models"],
    parseModels: parseTabularModels,
    parseModelInfo: parseTabularModelNames,
    effortInModelName: true,
    knownPaths: ["{localappdata}/agy/bin/agy.exe", "{home}/.local/bin/agy"],
    install:
      "winget install Google.AntigravityCLI  (macOS/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash)"
  },
  {
    cliType: "gemini",
    command: "gemini",
    label: "Gemini CLI",
    install: "npm install -g @google/gemini-cli",
    note: "no longer accepts Google AI Pro/Ultra logins (paid API key or Enterprise only); prefer antigravity"
  },
  {
    cliType: "copilot",
    command: "copilot",
    label: "GitHub Copilot CLI",
    install: "npm install -g @github/copilot"
  },
  {
    cliType: "opencode",
    command: "opencode",
    label: "opencode",
    modelHint: "provider/model ids, e.g. from `opencode models`",
    install: "npm install -g opencode-ai"
  },
  { cliType: "pi", command: "pi", label: "pi", install: "see the pi coding agent docs" },
  { cliType: "droid", command: "droid", label: "Factory droid", install: "see https://factory.ai" },
  { cliType: "amp", command: "amp", label: "Amp", install: "see https://ampcode.com" },

  // Extra CLIs, seated through the `text` cliType. Each preset asks for one plain answer with
  // the CLI's tools off or read-only where the CLI allows it.
  {
    cliType: "text",
    id: "ollama",
    command: "ollama",
    label: "Ollama (local models: Llama, Mistral, Qwen, DeepSeek, Gemma…)",
    presetArgs: ["run", "{providerModel}"],
    listModelsArgs: ["list"],
    parseModels: parseOllamaList,
    modelHint: "a pulled model, e.g. llama3.3 (see ollama list)",
    install: "https://ollama.com/download, then ollama pull llama3.3",
    note: "runs models on this computer; no tools, nothing leaves the machine"
  },
  {
    cliType: "text",
    id: "llm",
    command: "llm",
    label: "llm (many providers via plugins)",
    presetArgs: ["-m", "{providerModel}"],
    listModelsArgs: ["models"],
    parseModels: parseLlmModels,
    modelHint: "a model id from llm models",
    install: "pipx install llm (or uv tool install llm)"
  },
  {
    cliType: "text",
    id: "qwen",
    command: "qwen",
    label: "Qwen Code",
    // A Gemini CLI fork: same read-only "plan" approval mode; prompt on stdin.
    presetArgs: ["--approval-mode", "plan", "-m", "{providerModel}"],
    suggestedModels: ["qwen3-coder-plus"],
    install: "npm install -g @qwen-code/qwen-code",
    unverified: true
  },
  {
    cliType: "text",
    id: "aider",
    command: "aider",
    label: "Aider (OpenAI, Anthropic, DeepSeek, Grok, local…)",
    // Ask mode answers questions and never edits files.
    presetArgs: [
      "--chat-mode",
      "ask",
      "--no-git",
      "--no-auto-commits",
      "--no-check-update",
      "--no-pretty",
      "--no-stream",
      "--model",
      "{providerModel}",
      "--message",
      "{prompt}"
    ],
    modelHint: "any model aider supports, e.g. deepseek/deepseek-chat or xai/grok-4",
    install: "python -m pip install aider-install && aider-install",
    unverified: true
  },
  {
    cliType: "text",
    id: "cursor-agent",
    command: "cursor-agent",
    label: "Cursor Agent",
    // Without --force, print mode only proposes changes.
    presetArgs: ["-p", "--output-format", "text", "--model", "{providerModel}", "{prompt}"],
    modelHint: "a Cursor model id (cursor-agent --list-models)",
    install: "see https://cursor.com/cli",
    unverified: true
  },
  {
    cliType: "text",
    id: "goose",
    command: "goose",
    label: "Goose",
    presetArgs: ["run", "-i", "-", "--no-session"],
    // chat mode: Goose answers without using tools.
    presetEnv: { GOOSE_MODE: "chat" },
    modelHint: "the model set in goose configure",
    install: "see https://block.github.io/goose",
    unverified: true
  },
  {
    cliType: "text",
    id: "kimi",
    command: "kimi",
    label: "Kimi CLI",
    presetArgs: ["--quiet", "-m", "{providerModel}", "-p", "{prompt}"],
    suggestedModels: ["kimi-k2"],
    unrestricted:
      "Kimi's print mode approves its own tool use, so it could run commands. Use it only in an empty debate folder.",
    install: "uv tool install kimi-cli",
    unverified: true
  },
  {
    cliType: "text",
    id: "vibe",
    command: "vibe",
    label: "Mistral Vibe",
    presetArgs: ["--prompt", "{prompt}", "--output", "text"],
    suggestedModels: ["devstral-medium"],
    unrestricted:
      "Vibe's programmatic mode auto-approves its tools, so it could run commands. Use it only in an empty debate folder.",
    install: "uv tool install mistral-vibe",
    unverified: true
  }
];

export function catalogId(cli: KnownCli): string {
  return cli.id ?? cli.cliType;
}

/** How effort levels are written for people (the CLIs take the lower-case ids). */
export const EFFORT_LABELS: Record<string, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  ultra: "Ultra"
};

export function effortLabel(effort: string): string {
  return EFFORT_LABELS[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
}

/** A model's display name from the built-in catalog ("opus" and "claude-opus-5-5" are "Opus 5.5"). */
export function modelLabel(model: string, catalog: KnownCli[] = KNOWN_CLIS): string {
  for (const cli of catalog) {
    const label = cli.modelInfo?.[cli.modelAliases?.[model] ?? model]?.label;
    if (label) return label;
  }
  return model;
}

/** `ollama list`: a NAME/ID/SIZE/MODIFIED table; take the NAME column, dropping ":latest". */
export function parseOllamaList(stdout: string): string[] {
  const names = stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((name) => /^[\w.\-/:]+$/.test(name))
    .map((name) => name.replace(/:latest$/, ""));
  return [...new Set(names)];
}

/** `llm models`: lines like "OpenAI Chat: gpt-4o (aliases: 4o)". */
export function parseLlmModels(stdout: string): string[] {
  const ids: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^[^:]+:\s+([\w.\-/:@]+)/.exec(line.trim());
    if (match) ids.push(match[1]!);
  }
  return [...new Set(ids)];
}

/** Parses "model-id<whitespace>description" lines, skipping banners and blank lines. */
export function parseTabularModels(stdout: string): string[] {
  const ids: string[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    // Skip banners like "Fetching available models..." and headings like "Models:".
    if (!line || line.endsWith("...") || line.endsWith(":")) continue;
    const first = line.split(/\s+/)[0]!;
    if (!/^[\w.\-/:@]+$/.test(first)) continue;
    ids.push(first);
  }
  return [...new Set(ids)];
}

/** "model-id<whitespace>Display Name" lines (`agy models`): the display name of each id. */
export function parseTabularModelNames(stdout: string): Record<string, ModelInfo> {
  const out: Record<string, ModelInfo> = {};
  for (const raw of stdout.split(/\r?\n/)) {
    const match = /^([\w.\-/:@]+)\s+(\S.*)$/.exec(raw.trim());
    if (match && !raw.trim().endsWith("...")) out[match[1]!] = { label: match[2]!.trim().slice(0, 80) };
  }
  return out;
}

/** Picker-visible entries of `codex debug models` JSON. */
function codexListed(stdout: string): Array<Record<string, unknown> & { slug: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (m): m is Record<string, unknown> & { slug: string } =>
      typeof m?.slug === "string" && (m.visibility === undefined || m.visibility === "list")
  );
}

/** `codex debug models` JSON: each model's display name and description, and what each effort level does. */
export function parseCodexModelInfo(stdout: string): Record<string, ModelInfo> {
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : undefined;
  const out: Record<string, ModelInfo> = {};
  for (const m of codexListed(stdout)) {
    const effortDetails: Record<string, string> = {};
    for (const level of Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : []) {
      const l = level as { effort?: unknown; description?: unknown };
      const detail = text(l?.description);
      if (typeof l?.effort === "string" && detail) effortDetails[l.effort] = detail;
    }
    const label = text(m.display_name);
    const detail = text(m.description);
    // Only what Codex said, so it never blanks out catalog values when merged.
    out[m.slug] = {
      ...(label ? { label } : {}),
      ...(detail ? { detail } : {}),
      ...(Object.keys(effortDetails).length ? { effortDetails } : {})
    };
  }
  return out;
}

/** Parses `codex debug models` JSON, keeping only models Codex shows in its picker. */
export function parseCodexModelCatalog(stdout: string): string[] {
  return codexListed(stdout).map((m) => m.slug);
}

/** `codex debug models` JSON: picker-visible model -> its supported reasoning levels. */
export function parseCodexEffortLevels(stdout: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of codexListed(stdout)) {
    const levels = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [];
    out[m.slug] = levels
      .map((l) => (typeof l === "string" ? l : (l as { effort?: unknown })?.effort))
      .filter((l): l is string => typeof l === "string" && /^[a-z]+$/.test(l));
  }
  return out;
}

/** Resolves a command on PATH (honouring PATHEXT on Windows); returns its full path or null. */
export async function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<string | null> {
  const pathValue = env.PATH ?? env.Path ?? "";
  const exts =
    platform === "win32" && !extname(command)
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];

  for (const dir of pathValue.split(platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, command + ext.toLowerCase());
      try {
        await access(candidate);
        return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

async function findKnownPath(paths: string[] | undefined, env: NodeJS.ProcessEnv): Promise<string | null> {
  const home = env.USERPROFILE ?? env.HOME;
  for (const template of paths ?? []) {
    if (template.includes("{home}") && !home) continue;
    if (template.includes("{localappdata}") && !env.LOCALAPPDATA) continue;
    const candidate = normalize(
      template.replace("{home}", home ?? "").replace("{localappdata}", env.LOCALAPPDATA ?? "")
    );
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not installed there
    }
  }
  return null;
}

export interface DetectedCli {
  cli: KnownCli;
  path: string | null;
  models: string[];
  modelsSource: "listed" | "suggested" | "none";
  efforts: string[];
  /** Effort levels per model; a model listed with [] has no effort setting. */
  effortsByModel: Record<string, string[]>;
  /** Display names and details per model id (catalog first, then what the CLI listed). */
  modelInfo: Record<string, ModelInfo>;
  listError?: string;
}

export async function detectClis(options: {
  list?: boolean;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  catalog?: KnownCli[];
}): Promise<DetectedCli[]> {
  const { list = true, timeoutMs = 30_000, env = process.env, catalog = KNOWN_CLIS } = options;

  return Promise.all(
    catalog.map(async (cli): Promise<DetectedCli> => {
      const path = (await findOnPath(cli.command, env)) ?? (await findKnownPath(cli.knownPaths, env));
      const suggested = cli.suggestedModels ?? [];
      const staticEfforts: Record<string, string[]> = {};
      for (const [model, info] of Object.entries(cli.modelInfo ?? {})) {
        if (info.efforts) staticEfforts[model] = info.efforts;
      }
      const fallback: DetectedCli = {
        cli,
        path,
        models: suggested,
        modelsSource: suggested.length > 0 ? "suggested" : "none",
        efforts: cli.efforts ?? [],
        effortsByModel: staticEfforts,
        modelInfo: { ...cli.modelInfo }
      };
      if (!path || !list || !cli.listModelsArgs || !cli.parseModels) return fallback;

      try {
        const stdout = await captureStdout(path, cli.listModelsArgs, env, timeoutMs);
        const models = cli.parseModels(stdout);
        if (models.length === 0) return fallback;
        const listedInfo = cli.parseModelInfo?.(stdout) ?? {};
        const modelInfo = { ...fallback.modelInfo };
        for (const [model, info] of Object.entries(listedInfo)) modelInfo[model] = { ...modelInfo[model], ...info };
        return {
          ...fallback,
          models,
          modelsSource: "listed",
          effortsByModel: { ...staticEfforts, ...cli.parseEfforts?.(stdout) },
          modelInfo
        };
      } catch (error) {
        return { ...fallback, listError: error instanceof Error ? error.message : String(error) };
      }
    })
  );
}

/** Where the last model listing is kept, so the desk can show full pickers before a new scan ends. */
export function modelsCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ARGUE_MODELS_CACHE ?? join(homedir(), ".argue", "models-cache.json");
}

type CachedListing = Pick<DetectedCli, "models" | "effortsByModel" | "modelInfo"> & { path: string };

/** Keeps what each CLI listed (agy models, codex debug models) for the next desk launch. */
export async function saveModelsCache(file: string, detected: DetectedCli[]): Promise<void> {
  const listed: Record<string, CachedListing> = {};
  for (const d of detected) {
    if (d.path && d.modelsSource === "listed") {
      listed[catalogId(d.cli)] = {
        path: d.path,
        models: d.models,
        effortsByModel: d.effortsByModel,
        modelInfo: d.modelInfo
      };
    }
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFileAtomic(file, `${JSON.stringify({ version: 1, listed })}\n`);
}

/** Display names from the last listing ({ codex: { "gpt-6-luna": "GPT-6-Luna" } }), for saved reports. */
export async function cachedModelLabels(file: string): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { version?: unknown; listed?: Record<string, unknown> };
    if (raw?.version !== 1 || !raw.listed || typeof raw.listed !== "object") return out;
    for (const [cli, entry] of Object.entries(raw.listed)) {
      const info = (entry as { modelInfo?: unknown })?.modelInfo;
      if (!info || typeof info !== "object") continue;
      for (const [model, value] of Object.entries(info as Record<string, { label?: unknown }>)) {
        if (typeof value?.label === "string") (out[cli] ??= {})[model] = value.label.slice(0, 120);
      }
    }
  } catch {
    // no listing yet: reports fall back to the built-in names
  }
  return out;
}

/**
 * Gives quick detections (no listing) the models each CLI listed last time, while it is still at
 * the same path. Anything malformed in the file is ignored.
 */
export async function withCachedListings(file: string, detected: DetectedCli[]): Promise<DetectedCli[]> {
  let listed: Record<string, Partial<CachedListing>>;
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { version?: unknown; listed?: unknown };
    if (raw?.version !== 1 || !raw.listed || typeof raw.listed !== "object") return detected;
    listed = raw.listed as Record<string, Partial<CachedListing>>;
  } catch {
    return detected;
  }
  const ids = (value: unknown, pattern: RegExp): string[] | null =>
    Array.isArray(value) && value.every((v) => typeof v === "string" && pattern.test(v)) ? (value as string[]) : null;
  return detected.map((d) => {
    const cached = Object.prototype.hasOwnProperty.call(listed, catalogId(d.cli))
      ? listed[catalogId(d.cli)]
      : undefined;
    const models = ids(cached?.models, /^[\w.\-/:@]+$/);
    if (!d.path || !cached || cached.path !== d.path || !models?.length) return d;
    const effortsByModel = { ...d.effortsByModel };
    for (const [model, levels] of Object.entries(cached.effortsByModel ?? {})) {
      const valid = ids(levels, /^[a-z]{1,20}$/);
      if (valid) effortsByModel[model] = valid;
    }
    const modelInfo = { ...d.modelInfo };
    for (const [model, info] of Object.entries(cached.modelInfo ?? {})) {
      if (!info || typeof info !== "object") continue;
      const text = (v: unknown): string | undefined => (typeof v === "string" ? v.slice(0, 120) : undefined);
      const details = info.effortDetails && typeof info.effortDetails === "object" ? info.effortDetails : {};
      modelInfo[model] = {
        ...modelInfo[model],
        ...(text(info.label) ? { label: text(info.label) } : {}),
        ...(text(info.detail) ? { detail: text(info.detail) } : {}),
        ...(text(info.group) ? { group: text(info.group) } : {}),
        effortDetails: Object.fromEntries(
          Object.entries(details).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      };
    }
    return { ...d, models, modelsSource: "listed", effortsByModel, modelInfo };
  });
}

function captureStdout(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    const { stdout: out, stderr: err } = child;
    if (!out || !err) {
      reject(new Error("spawned without stdio pipes"));
      return;
    }
    let stdout = "";
    let stderr = "";
    out.setEncoding("utf8");
    err.setEncoding("utf8");
    out.on("data", (chunk: string) => (stdout += chunk));
    err.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`exit code ${code ?? "null"}: ${stderr.trim().split(/\r?\n/)[0] ?? ""}`));
    });
  });
}

/** The one-liner that adds a CLI + model as a provider and agent in the workspace config. */
export function addProviderCommand(cli: KnownCli, model: string): string {
  const id = catalogId(cli);
  const preset = cli.presetArgs ? ` --command ${cli.command} --args ${cli.presetArgs.join(",")}` : "";
  return `argue config add-provider --id ${id} --type cli --cli-type ${cli.cliType}${preset} --model-id ${model} --agent ${id}`;
}

export function formatDetectedClis(detected: DetectedCli[]): string[] {
  const lines: string[] = [];
  const installed = detected.filter((d) => d.path);
  const missing = detected.filter((d) => !d.path);

  lines.push(`Installed agent CLIs (${installed.length}):`);
  if (installed.length === 0) lines.push("  (none found on PATH)");
  for (const d of installed) {
    lines.push("");
    lines.push(`  ${d.cli.label}  [cliType: ${d.cli.cliType}]  ${d.path}`);
    if (d.cli.note) lines.push(`    note: ${d.cli.note}`);
    if (d.models.length > 0) {
      lines.push(`    models (${d.modelsSource}): ${d.models.join(", ")}`);
    } else {
      lines.push(`    models: ${d.cli.modelHint ?? "check this CLI's docs for model ids"}`);
    }
    if (d.listError) lines.push(`    (model listing failed: ${d.listError})`);
    lines.push(`    add: ${addProviderCommand(d.cli, d.models[0] ?? "<model-id>")}`);
  }

  if (missing.length > 0) {
    lines.push("");
    lines.push("Not installed:");
    for (const d of missing) lines.push(`  ${d.cli.label} (${d.cli.command}): ${d.cli.install}`);
  }

  lines.push("");
  lines.push("Any other agent CLI: use --cli-type text, e.g.");
  lines.push(
    "  argue config add-provider --id mycli --type cli --cli-type text --command mycli --args -m,{providerModel} --model-id <model> --agent mycli"
  );
  lines.push("  (prompt goes to stdin; put {prompt} in --args instead if the CLI only takes it as an argument)");
  return lines;
}
