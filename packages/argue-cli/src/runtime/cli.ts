import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
// cross-spawn resolves Windows `.cmd` shims (npm-installed CLIs) and shebang scripts,
// escaping args for cmd.exe; on other platforms it delegates to child_process.spawn.
import spawn from "cross-spawn";
import { defaultCliCommand, type CliProviderConfig } from "../config.js";
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
        provider.args
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
        abortSignal
      });

      if (provider.cliType === "antigravity") {
        const parsed = parseAntigravityResult(result.stdout);
        await recordAntigravityTokens(parsed.totalTokens);
        return normalizeTaskOutputFromText(task, parsed.response);
      }

      if (provider.cliType === "claude") {
        const parsed = parseClaudeStream(result.stdout);
        if (parsed.rateLimit) await recordClaudeRateLimit(parsed.rateLimit);
        return normalizeTaskOutputFromText(task, parsed.response);
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
      throw new Error(
        `antigravity CLI returned status=${String(result.status ?? "missing")} error=${String(result.error ?? "empty")}`
      );
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
  let response: string | null = null;
  let rateLimit: unknown = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    let event: { type?: unknown; result?: unknown; is_error?: unknown; rate_limit_info?: unknown };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type === "rate_limit_event") rateLimit = event.rate_limit_info;
    if (event.type === "result") {
      if (event.is_error === true) {
        throw new Error(`claude CLI returned an error result: ${String(event.result ?? "no details")}`);
      }
      if (typeof event.result === "string") response = event.result;
    }
  }
  return { response: response ?? stdout, rateLimit };
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
  userArgs: string[] = []
): BaseArgsResult {
  switch (cliType) {
    case "claude": {
      // stream-json (which requires --verbose) also reports plan rate limits; see parseClaudeStream.
      const output = ["--output-format", "stream-json", "--verbose"];
      const args =
        sessionUUID && isResume
          ? ["--print", "--model", providerModel, ...output, "--resume", sessionUUID]
          : [
              "--print",
              "--model",
              providerModel,
              ...output,
              ...(sessionUUID ? ["--session-id", sessionUUID] : ["--no-session-persistence"])
            ];

      return {
        args: reasoning ? [...args, "--effort", reasoning] : args,
        reasoningApplied: !!reasoning
      };
    }
    case "codex": {
      const reasoningArgs = reasoning ? ["-c", `model_reasoning_effort=${reasoning}`] : [];
      // Debates need no tool writes, so default to a read-only sandbox. If the user's args
      // already choose a mode (e.g. --sandbox workspace-write for --action), defer to them.
      const sandboxArgs = userArgs.some((arg) => CODEX_PERMISSION_FLAGS.has(arg.split("=")[0]!))
        ? []
        : ["--sandbox", "read-only"];
      return {
        args: [
          "exec",
          "-m",
          providerModel,
          ...reasoningArgs,
          ...sandboxArgs,
          "--color",
          "never",
          "--skip-git-repo-check"
        ],
        reasoningApplied: !!reasoning
      };
    }
    case "copilot":
      return { args: ["-p", prompt, "--yolo", "--model", providerModel], reasoningApplied: false };
    case "gemini":
      return { args: ["--approval-mode", "yolo", "-m", providerModel], reasoningApplied: false };
    case "antigravity":
      // No permission bypass: tools needing approval are soft-denied in headless mode,
      // which is fine for debates.
      return {
        args: ["--input-format", "stream-json", "--output-format", "stream-json", "--model", providerModel],
        reasoningApplied: false
      };
    case "pi": {
      const sessionArgs = sessionUUID ? ["--session", join(tmpdir(), `argue-pi-${sessionUUID}`)] : [];
      return { args: ["--model", providerModel, ...sessionArgs], reasoningApplied: false };
    }
    case "opencode":
      return { args: ["run", "--dangerously-skip-permissions", "-m", providerModel], reasoningApplied: false };
    case "droid":
      return { args: ["exec", "--auto", "high", "-m", providerModel], reasoningApplied: false };
    case "amp":
      return { args: ["-x", prompt, "--dangerously-allow-all"], reasoningApplied: false };
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
  abortSignal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(args.command, args.args, {
      env: args.env,
      stdio: "pipe",
      signal: args.abortSignal
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

      reject(
        new Error(
          `CLI provider exited with code=${code ?? "null"} signal=${signal ?? "null"} stderr=${stderr.trim() || "empty"} stdout=${stdout.trim() || "empty"}`
        )
      );
    });

    input.end(args.stdin);
  });
}
