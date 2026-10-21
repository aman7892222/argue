import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// cross-spawn resolves Windows `.cmd` shims (npm-installed CLIs) and shebang scripts,
// escaping args for cmd.exe; on other platforms it delegates to child_process.spawn.
import spawn from "cross-spawn";
import { defaultCliCommand, type CliProviderConfig } from "../config.js";
import { PLAN_LIMIT_PREFIX } from "../drop-reason.js";
import { recordAntigravityTokens, recordClaudeRateLimit } from "../usage.js";
import { buildTaskPrompt } from "./prompt.js";
import { normalizeTaskOutput, normalizeTaskOutputFromText } from "./task-output.js";
import type { ProviderTaskRunner } from "./types.js";

type BaseArgsResult = {
  args: string[];
  reasoningApplied: boolean;
};

export function createCliRunner(raw: CliProviderConfig): ProviderTaskRunner {
  const provider = { ...raw, command: raw.command ?? defaultCliCommand(raw.cliType) };
  const sessionUUID = randomUUID();
  let callCount = 0;
  let warnedUnsupportedReasoning = false;

  return {
    async runTask({ task, agent, abortSignal }) {
      const reasoning = agent.reasoning ?? agent.modelConfig.reasoning;
      const prompt =
        provider.cliType === "generic"
          ? JSON.stringify(buildGenericEnvelope(task, agent, reasoning), null, 2)
          : buildTaskPrompt({ task, agent, includeJsonSchema: true });

      const hasSession = !!task.metadata?.participantSessionKey;
      const isResume = hasSession && callCount > 0;
      callCount++;
      const { args: baseArgs, reasoningApplied } = buildBaseArgs(
        provider.cliType,
        agent.providerModel,
        prompt,
        reasoning,
        hasSession ? sessionUUID : undefined,
        isResume,
        provider.args,
        provider.permissionMode ?? "safe"
      );
      // `text` CLIs that cannot read stdin take the prompt through a `{prompt}` arg instead.
      const promptInArgs = provider.cliType === "text" && provider.args.some((arg) => arg.includes("{prompt}"));
      const extraArgs = provider.args.map((arg) => {
        const rendered = renderTemplate(arg, task, agent);
        return provider.cliType === "text" ? rendered.replaceAll("{prompt}", prompt) : rendered;
      });

      if (reasoning && !reasoningApplied && !warnedUnsupportedReasoning) {
        warnedUnsupportedReasoning = true;
        warnUnsupportedReasoning(provider.cliType, reasoning);
      }

      const result = await runCommand({
        command: provider.command,
        args: [...baseArgs, ...extraArgs],
        env: {
          ...process.env,
          ...renderEnv(provider.env, task, agent),
          ARGUE_TASK_KIND: task.kind,
          ARGUE_REQUEST_ID: task.requestId,
          ARGUE_SESSION_ID: task.sessionId,
          ARGUE_PARTICIPANT_ID: task.participantId,
          ARGUE_PROVIDER_MODEL: agent.providerModel,
          ...(task.kind === "round"
            ? {
                ARGUE_TASK_PHASE: task.phase,
                ARGUE_TASK_ROUND: String(task.round)
              }
            : {})
        },
        stdin: promptInArgs ? "" : buildStdin(provider.cliType, prompt),
        // Restricted Claude can only read inside its working dirs, so start it in the attachments folder.
        cwd:
          provider.cliType === "claude" && (provider.permissionMode ?? "safe") === "safe"
            ? attachmentDirs(debateAttachments())[0]
            : undefined,
        abortSignal
      }).catch(async (error: unknown) => {
        throw await explainCliFailure(provider.cliType, error);
      });

      if (provider.cliType === "antigravity") {
        const parsed = parseAntigravityResult(result.stdout);
        await recordAntigravityTokens(parsed.totalTokens);
        return normalizeTaskOutputFromText(task, parsed.response);
      }

      if (provider.cliType === "claude") {
        const stream = readClaudeStream(result.stdout);
        if (stream.rateLimit) await recordClaudeRateLimit(stream.rateLimit);
        if (stream.failure) throw claudeFailure(stream.failure);
        return normalizeTaskOutputFromText(task, stream.response ?? result.stdout);
      }

      if (provider.cliType === "generic") {
        try {
          return normalizeTaskOutput(task, JSON.parse(result.stdout.trim()));
        } catch {
          return normalizeTaskOutputFromText(task, result.stdout);
        }
      }

      return normalizeTaskOutputFromText(task, result.stdout);
    }
  };
}

function buildStdin(cliType: CliProviderConfig["cliType"], prompt: string): string {
  if (cliType === "antigravity") {
    // agy headless stream-json input: one JSON event per line; the process exits when stdin closes.
    return JSON.stringify({ event: "user", message: { content: prompt } }) + "\n";
  }
  return usesStdinPrompt(cliType) ? prompt : "";
}

/**
 * Pulls the final answer out of agy `--output-format stream-json` output, where the
 * terminal line is `{"event":"result","result":{"status":"SUCCESS"|"ERROR",...}}`.
 */
export function extractAntigravityResponse(stdout: string): string {
  return parseAntigravityResult(stdout).response;
}

export function parseAntigravityResult(stdout: string): { response: string; totalTokens: number } {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    let event: unknown;
    try {
      event = JSON.parse(lines[i]!);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object" || (event as { event?: unknown }).event !== "result") continue;

    const result = (event as { result?: { status?: unknown; response?: unknown; error?: unknown } }).result ?? {};
    if (result.status !== "SUCCESS") {
      const error = String(result.error ?? "empty");
      if (LIMIT_WORDS.test(error)) throw new Error(PLAN_LIMIT_PREFIX + tidyLimitText(error));
      throw new Error(`antigravity CLI returned status=${String(result.status ?? "missing")} error=${error}`);
    }
    if (typeof result.response !== "string") {
      throw new Error("antigravity CLI result event has no string response");
    }
    const usage = (result as { usage?: { total_tokens?: unknown } }).usage;
    return {
      response: result.response,
      totalTokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : 0
    };
  }

  throw new Error(`antigravity CLI produced no result event. stdout=${stdout.trim() || "empty"}`);
}

/**
 * Reads `claude --output-format stream-json --verbose` output: the answer comes from the
 * final `result` event, and `rate_limit_event` carries 5-hour / 7-day plan utilization.
 * Output that is not stream-json (e.g. a wrapper script) is used as the answer verbatim.
 */
export function parseClaudeStream(stdout: string): { response: string; rateLimit: unknown } {
  const stream = readClaudeStream(stdout);
  if (stream.failure) throw claudeFailure(stream.failure);
  return { response: stream.response ?? stdout, rateLimit: stream.rateLimit };
}

type ClaudeFailure = { message: string; limit: boolean };

/**
 * Claude's stream, read without throwing: the answer, the latest plan utilization, and the
 * error it reported, if any. Claude also exits non-zero then, so this runs on failures too.
 */
function readClaudeStream(stdout: string): {
  response: string | null;
  rateLimit: unknown;
  failure: ClaudeFailure | null;
} {
  let response: string | null = null;
  let rateLimit: unknown = null;
  let rejected = false;
  let failure: ClaudeFailure | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    let event: {
      type?: unknown;
      result?: unknown;
      is_error?: unknown;
      api_error_status?: unknown;
      rate_limit_info?: { status?: unknown };
    };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type === "rate_limit_event") {
      rateLimit = event.rate_limit_info;
      rejected ||= event.rate_limit_info?.status === "rejected";
    }
    if (event.type === "result") {
      if (event.is_error === true) {
        const message = String(event.result ?? "no details");
        failure = { message, limit: rejected || event.api_error_status === 429 || LIMIT_WORDS.test(message) };
      } else if (typeof event.result === "string") response = event.result;
    }
  }
  return { response, rateLimit, failure };
}

function claudeFailure(failure: ClaudeFailure): Error {
  return new Error(
    failure.limit
      ? PLAN_LIMIT_PREFIX + tidyLimitText(failure.message)
      : `claude CLI returned an error result: ${failure.message}`
  );
}

const LIMIT_WORDS =
  /usage limit|session limit|rate[ _-]?limit|quota|resource[_ ]exhausted|too many requests|out of credits|limit reached/i;

/** One short line: no links, no "ERROR:" label, at most 200 characters. */
function tidyLimitText(text: string): string {
  return text
    .replace(/\s*\(https?:\/\/[^)]*\)/g, "")
    .replace(/,?\s*visit https?:\/\/\S+ to purchase more credits/g, "")
    .replace(/,?\s*visit https?:\/\/\S+/g, "")
    .replace(/^\W*error\W*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Turns a failed CLI call into a readable error. Claude and Antigravity describe failures in
 * their structured output; for any other CLI only its error output (stderr) is checked for limit
 * wording, never the answer, which may well talk about rate limits.
 */
export async function explainCliFailure(cliType: CliProviderConfig["cliType"], error: unknown): Promise<Error> {
  if (!(error instanceof CliExitError)) return error instanceof Error ? error : new Error(String(error));
  if (cliType === "claude") {
    const stream = readClaudeStream(error.stdout);
    // A refused call still reports the plan's utilization: the usage ring then shows it full.
    if (stream.rateLimit) await recordClaudeRateLimit(stream.rateLimit).catch(() => undefined);
    if (stream.failure) return claudeFailure(stream.failure);
  }
  if (cliType === "antigravity") {
    try {
      parseAntigravityResult(error.stdout);
    } catch (described) {
      if (described instanceof Error && !described.message.includes("produced no result event")) return described;
    }
  }
  // eslint-disable-next-line no-control-regex
  const lines = error.stderr.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/);
  const limitLine = lines.find((line) => LIMIT_WORDS.test(line));
  return limitLine ? new Error(PLAN_LIMIT_PREFIX + tidyLimitText(limitLine)) : error;
}

/** A CLI that exited with an error, with everything it printed. */
export class CliExitError extends Error {
  constructor(
    readonly code: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly stdout: string,
    readonly stderr: string
  ) {
    super(
      `CLI provider exited with code=${code ?? "null"} signal=${signal ?? "null"} stderr=${stderr.trim() || "empty"} stdout=${stdout.trim() || "empty"}`
    );
    this.name = "CliExitError";
  }
}

/** Returns true if the CLI tool reads the prompt from stdin, false if it goes in args. */
function usesStdinPrompt(cliType: CliProviderConfig["cliType"]): boolean {
  switch (cliType) {
    case "claude":
    case "codex":
    case "gemini":
    case "pi":
    case "antigravity":
    case "text":
    case "generic":
      return true;
    case "copilot":
    case "amp":
      return false;
    case "opencode":
      return true;
    case "droid":
    default:
      return true;
  }
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;

/** Files attached to this debate (`argue run --attach`), as absolute paths. */
export function debateAttachments(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    const parsed = JSON.parse(env.ARGUE_ATTACHMENTS ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function attachmentDirs(files: string[]): string[] {
  return [...new Set(files.map((file) => dirname(file)))];
}

const CODEX_PERMISSION_FLAGS = new Set([
  "-s",
  "--sandbox",
  "--approve-for-me",
  "--full-auto",
  "--dangerously-bypass-approvals-and-sandbox"
]);

function buildBaseArgs(
  cliType: CliProviderConfig["cliType"],
  providerModel: string,
  prompt: string,
  reasoning?: string,
  sessionUUID?: string,
  isResume?: boolean,
  userArgs: string[] = [],
  permissionMode: "safe" | "auto" = "safe"
): BaseArgsResult {
  // A debate only needs text in and text out. In "safe" mode (the default) no agent gets
  // auto-approval, so a hostile task or a peer's output cannot make it run commands or edit
  // files. "auto" restores each CLI's own auto-approve flags for `--action` style work.
  const auto = permissionMode === "auto";
  switch (cliType) {
    case "claude": {
      // stream-json (which requires --verbose) also reports plan rate limits; see parseClaudeStream.
      const output = ["--output-format", "stream-json", "--verbose"];
      // Safe: restricted mode (no command-running tools, user/project settings ignored, file tools
      // confined to the working dirs), no MCP servers, no skills, and no tools at all, except Read
      // when the debate has attachments; the runner then starts Claude inside the attachments folder.
      const attachments = debateAttachments();
      const lockdown = auto
        ? []
        : [
            "--restricted",
            "--tools",
            attachments.length ? "Read" : "",
            ...attachmentDirs(attachments)
              .slice(1)
              .flatMap((dir) => ["--add-dir", dir]),
            "--strict-mcp-config",
            "--disable-slash-commands"
          ];
      const args =
        sessionUUID && isResume
          ? ["--print", "--model", providerModel, ...output, ...lockdown, "--resume", sessionUUID]
          : [
              "--print",
              "--model",
              providerModel,
              ...output,
              ...lockdown,
              ...(sessionUUID ? ["--session-id", sessionUUID] : ["--no-session-persistence"])
            ];

      return {
        args: reasoning ? [...args, "--effort", reasoning] : args,
        reasoningApplied: !!reasoning
      };
    }
    case "codex": {
      const reasoningArgs = reasoning ? ["-c", `model_reasoning_effort=${reasoning}`] : [];
      // Safe: read-only sandbox. Auto: Codex's own automatic approval. Either way, if the
      // user's args already choose a mode (e.g. --sandbox workspace-write), defer to them.
      const sandboxArgs = userArgs.some((arg) => CODEX_PERMISSION_FLAGS.has(arg.split("=")[0]!))
        ? []
        : auto
          ? ["--approve-for-me"]
          : ["--sandbox", "read-only"];
      return {
        args: [
          "exec",
          "-m",
          providerModel,
          ...reasoningArgs,
          ...sandboxArgs,
          // Images go straight to the model; other files are listed in the task for it to read.
          ...debateAttachments()
            .filter((file) => IMAGE_FILE.test(file))
            .flatMap((file) => ["-i", file]),
          "--color",
          "never",
          "--skip-git-repo-check"
        ],
        reasoningApplied: !!reasoning
      };
    }
    case "copilot":
      return { args: ["-p", prompt, ...(auto ? ["--yolo"] : []), "--model", providerModel], reasoningApplied: false };
    case "gemini":
      // "plan" is Gemini CLI's read-only mode.
      return { args: ["--approval-mode", auto ? "yolo" : "plan", "-m", providerModel], reasoningApplied: false };
    case "antigravity":
      // Safe: no bypass flag, so tools needing approval are soft-denied in headless mode.
      return {
        args: [
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
          "--model",
          providerModel,
          ...attachmentDirs(debateAttachments()).flatMap((dir) => ["--add-dir", dir]),
          ...(auto ? ["--dangerously-skip-permissions"] : [])
        ],
        reasoningApplied: false
      };
    case "pi": {
      const sessionArgs = sessionUUID ? ["--session", join(tmpdir(), `argue-pi-${sessionUUID}`)] : [];
      return { args: ["--model", providerModel, ...sessionArgs], reasoningApplied: false };
    }
    case "opencode":
      return {
        args: ["run", ...(auto ? ["--dangerously-skip-permissions"] : []), "-m", providerModel],
        reasoningApplied: false
      };
    case "droid":
      // droid exec is read-only unless given an --auto level.
      return { args: ["exec", ...(auto ? ["--auto", "high"] : []), "-m", providerModel], reasoningApplied: false };
    case "amp":
      return { args: ["-x", prompt, ...(auto ? ["--dangerously-allow-all"] : [])], reasoningApplied: false };
    case "text":
      // Any other agent CLI: no built-in flags; the user's `args` carry model/print flags.
      return { args: [], reasoningApplied: false };
    case "generic":
      return { args: [], reasoningApplied: !!reasoning };
    default:
      return { args: [], reasoningApplied: false };
  }
}

function buildGenericEnvelope(
  task: Parameters<typeof buildTaskPrompt>[0]["task"],
  agent: Parameters<typeof buildTaskPrompt>[0]["agent"],
  reasoning?: string
): Record<string, unknown> {
  return {
    version: 1,
    agent: {
      id: agent.id,
      role: agent.role,
      provider: agent.provider,
      model: agent.model,
      providerModel: agent.providerModel,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      reasoning
    },
    task
  };
}

function warnUnsupportedReasoning(cliType: CliProviderConfig["cliType"], reasoning: string): void {
  process.stderr.write(
    `[argue] warning: reasoning='${reasoning}' configured for cliType '${cliType}', ` +
      "but this adapter does not have a verified reasoning flag yet. Ignoring for now. " +
      "If this provider supports reasoning, please open an issue: https://github.com/onevcat/argue/issues\n"
  );
}

function renderEnv(
  env: CliProviderConfig["env"],
  task: Parameters<typeof buildTaskPrompt>[0]["task"],
  agent: Parameters<typeof buildTaskPrompt>[0]["agent"]
): Record<string, string> {
  if (!env) return {};

  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, renderTemplate(value, task, agent)]));
}

function renderTemplate(
  template: string,
  task: Parameters<typeof buildTaskPrompt>[0]["task"],
  agent: Parameters<typeof buildTaskPrompt>[0]["agent"]
): string {
  return template
    .replaceAll("{requestId}", task.requestId)
    .replaceAll("{sessionId}", task.sessionId)
    .replaceAll("{participantId}", task.participantId)
    .replaceAll("{taskKind}", task.kind)
    .replaceAll("{providerModel}", agent.providerModel)
    .replaceAll("{agentId}", agent.id)
    .replaceAll("{role}", agent.role ?? "")
    .replaceAll("{phase}", task.kind === "round" ? task.phase : "report")
    .replaceAll("{round}", task.kind === "round" ? String(task.round) : "");
}

async function runCommand(args: {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  stdin: string;
  cwd?: string;
  abortSignal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(args.command, args.args, {
      env: args.env,
      stdio: "pipe",
      signal: args.abortSignal,
      ...(args.cwd ? { cwd: args.cwd } : {})
    });
    const { stdout: out, stderr: err, stdin: input } = child;
    if (!out || !err || !input) {
      reject(new Error("CLI provider spawned without stdio pipes"));
      return;
    }

    let stdout = "";
    let stderr = "";

    out.setEncoding("utf8");
    err.setEncoding("utf8");

    out.on("data", (chunk: string) => {
      stdout += chunk;
    });
    err.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new CliExitError(code, signal, stdout, stderr));
    });

    input.end(args.stdin);
  });
}
