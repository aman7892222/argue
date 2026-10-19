import { access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import spawn from "cross-spawn";
import type { CliType } from "./config.js";

/** A known agent CLI that argue can seat as a participant. */
export interface KnownCli {
  cliType: Exclude<CliType, "text" | "generic">;
  command: string;
  label: string;
  /** Args that print the CLI's model list. Only set where the output format is verified. */
  listModelsArgs?: string[];
  parseModels?: (stdout: string) => string[];
  /** Model ids/aliases to suggest when the CLI cannot list its own models. */
  suggestedModels?: string[];
  /** Shown when the CLI cannot list models (where to find valid ids). */
  modelHint?: string;
  install: string;
  note?: string;
  /** Standard install locations to try when the command is not on PATH ({home}, {localappdata}). */
  knownPaths?: string[];
}

export const KNOWN_CLIS: KnownCli[] = [
  {
    cliType: "claude",
    command: "claude",
    label: "Claude Code",
    suggestedModels: ["opus", "sonnet", "haiku", "fable"],
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
    modelHint: "run `codex` and use /model to see ids available on your plan",
    install: "npm install -g @openai/codex@latest, then `codex login`"
  },
  {
    cliType: "antigravity",
    command: "agy",
    label: "Google Antigravity",
    listModelsArgs: ["models"],
    parseModels: parseTabularModels,
    knownPaths: ["{localappdata}/agy/bin/agy.exe"],
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
  { cliType: "amp", command: "amp", label: "Amp", install: "see https://ampcode.com" }
];

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

/** Parses `codex debug models` JSON, keeping only models Codex shows in its picker. */
export function parseCodexModelCatalog(stdout: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is { slug: string; visibility?: unknown } => typeof m?.slug === "string")
    .filter((m) => m.visibility === undefined || m.visibility === "list")
    .map((m) => m.slug);
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
      const fallback: DetectedCli = {
        cli,
        path,
        models: suggested,
        modelsSource: suggested.length > 0 ? "suggested" : "none"
      };
      if (!path || !list || !cli.listModelsArgs || !cli.parseModels) return fallback;

      try {
        const stdout = await captureStdout(path, cli.listModelsArgs, env, timeoutMs);
        const models = cli.parseModels(stdout);
        return models.length > 0 ? { cli, path, models, modelsSource: "listed" } : fallback;
      } catch (error) {
        return { ...fallback, listError: error instanceof Error ? error.message : String(error) };
      }
    })
  );
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
  const id = cli.cliType;
  return `argue config add-provider --id ${id} --type cli --cli-type ${cli.cliType} --model-id ${model} --agent ${id}`;
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
