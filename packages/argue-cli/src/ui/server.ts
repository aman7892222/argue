import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { loadCliConfig, type LoadedCliConfig } from "../config.js";
import { newRequestId, REQUEST_ID_PATTERN } from "../request-id.js";
import { resolveRunPlan } from "../run-plan.js";
import { renderUiPage } from "./page.js";

const TOKEN_PLACEHOLDER = "{requestId}";
const MAX_BODY_BYTES = 64 * 1024;
const STDERR_TAIL_LINES = 40;
// A run with no new events for longer than argue's default per-round timeout is treated as abandoned.
const STALE_AFTER_MS = 25 * 60 * 1000;

export type UiServerOptions = {
  configPath?: string;
  port?: number;
  /** Override how `argue run` is launched (tests). Defaults to this CLI's own entry point. */
  runCommand?: { command: string; args: string[] };
};

export type UiServer = {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
};

type RunPaths = { requestId: string; jsonlPath: string; resultPath: string; summaryPath: string; errorPath: string };

type LaunchedRun = {
  requestId: string;
  child: ChildProcess;
  state: "running" | "exited";
  exitCode: number | null;
  stderrTail: string[];
  startedAt: string;
  task: string;
};

/**
 * Starts the local debate UI: a single page plus a small JSON API, bound to 127.0.0.1.
 * Every API call must carry the per-launch token, and the Host header must be loopback,
 * so other web pages (and DNS-rebinding tricks) cannot read runs or start debates.
 */
export async function startUiServer(options: UiServerOptions = {}): Promise<UiServer> {
  const token = randomBytes(24).toString("base64url");
  const launched = new Map<string, LaunchedRun>();
  const runCommand = options.runCommand ?? defaultRunCommand();

  const loadConfig = (): Promise<LoadedCliConfig> => loadCliConfig({ explicitPath: options.configPath });

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => sendJson(res, 500, { error: String(error) }));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const port = (server.address() as { port: number }).port;
    if (!isLoopbackHost(req.headers.host, port)) {
      sendJson(res, 403, { error: "forbidden host" });
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'"
      });
      res.end(renderUiPage());
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    if (req.headers["x-argue-token"] !== token) {
      sendJson(res, 401, { error: "missing or invalid token" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      const loaded = await loadConfig();
      sendJson(res, 200, {
        configPath: loaded.configPath,
        agents: loaded.config.agents.map((agent) => ({
          id: agent.id,
          provider: agent.provider,
          model: agent.model,
          role: agent.role
        })),
        defaults: {
          agents: loaded.config.defaults?.defaultAgents ?? loaded.config.agents.map((agent) => agent.id),
          maxRounds: loaded.config.defaults?.maxRounds ?? 3,
          threshold: loaded.config.defaults?.consensusThreshold ?? 1
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/runs") {
      const loaded = await loadConfig();
      const runs = await listRuns(loaded);
      // Runs launched here appear immediately, before argue has written their first event.
      for (const requestId of launched.keys()) {
        if (!runs.some((run) => run.requestId === requestId)) runs.push(runPathsFor(loaded, requestId));
      }
      runs.sort((a, b) => b.requestId.localeCompare(a.requestId));
      sendJson(res, 200, {
        runs: await Promise.all(
          runs.map(async (paths) => ({
            ...(await summarizeRun(paths)),
            process: describeLaunch(launched.get(paths.requestId))
          }))
        )
      });
      return;
    }

    const runMatch = /^\/api\/runs\/([^/]+)(\/stop)?$/.exec(url.pathname);
    if (runMatch) {
      const requestId = decodeURIComponent(runMatch[1]!);
      if (!REQUEST_ID_PATTERN.test(requestId)) {
        sendJson(res, 400, { error: "invalid request id" });
        return;
      }

      if (runMatch[2] && req.method === "POST") {
        const run = launched.get(requestId);
        if (!run || run.state !== "running") {
          sendJson(res, 409, { error: "run is not running in this UI session" });
          return;
        }
        killTree(run.child);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (!runMatch[2] && req.method === "GET") {
        const loaded = await loadConfig();
        const paths = runPathsFor(loaded, requestId);
        const since = Number(url.searchParams.get("since") ?? "0");
        const events = await readEvents(paths.jsonlPath);
        sendJson(res, 200, {
          requestId,
          events: events.filter((event) => typeof event.seq === "number" && event.seq >= since),
          result: await readJson(paths.resultPath),
          error: await readJson(paths.errorPath),
          process: describeLaunch(launched.get(requestId))
        });
        return;
      }
    }

    if (req.method === "POST" && url.pathname === "/api/runs") {
      const body = await readBody(req);
      const loaded = await loadConfig();
      const request = parseStartRequest(body, loaded);
      if (!request.ok) {
        sendJson(res, 400, { error: request.error });
        return;
      }

      const requestId = newRequestId();
      // Validate the plan up front so bad input fails here, not inside the child process.
      resolveRunPlan({
        loadedConfig: loaded,
        runInput: {},
        overrides: { requestId, task: request.value.task, agents: request.value.agents }
      });

      const args = [
        ...runCommand.args,
        "run",
        "--config",
        loaded.configPath,
        "--request-id",
        requestId,
        "--task",
        request.value.task,
        "--agents",
        request.value.agents.join(","),
        "--min-rounds",
        String(Math.min(2, request.value.maxRounds)),
        "--max-rounds",
        String(request.value.maxRounds),
        "--threshold",
        String(request.value.threshold),
        "--no-color"
      ];
      const child = nodeSpawn(runCommand.command, args, {
        cwd: loaded.configDir,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      });
      const run: LaunchedRun = {
        requestId,
        child,
        state: "running",
        exitCode: null,
        stderrTail: [],
        startedAt: new Date().toISOString(),
        task: request.value.task
      };
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        run.stderrTail.push(...chunk.split(/\r?\n/).filter((line) => line.trim().length > 0));
        if (run.stderrTail.length > STDERR_TAIL_LINES)
          run.stderrTail.splice(0, run.stderrTail.length - STDERR_TAIL_LINES);
      });
      child.on("error", (error) => {
        run.state = "exited";
        run.stderrTail.push(String(error));
      });
      child.on("close", (code) => {
        run.state = "exited";
        run.exitCode = code;
      });
      launched.set(requestId, run);

      sendJson(res, 201, { requestId });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });

  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/#t=${token}`,
    port,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        for (const run of launched.values()) if (run.state === "running") killTree(run.child);
        server.close(() => resolve());
        server.closeAllConnections();
      })
  };
}

function defaultRunCommand(): { command: string; args: string[] } {
  // dist/ui/server.js -> dist/cli.js
  const cliEntry = fileURLToPath(new URL("../cli.js", import.meta.url));
  return { command: process.execPath, args: [cliEntry] };
}

export function isLoopbackHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

type StartRequest = { task: string; agents: string[]; maxRounds: number; threshold: number };

export function parseStartRequest(
  body: unknown,
  loaded: LoadedCliConfig
): { ok: true; value: StartRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "expected a JSON object" };
  const input = body as Record<string, unknown>;

  const task = typeof input.task === "string" ? input.task.trim() : "";
  if (!task) return { ok: false, error: "task is required" };
  if (task.length > 20_000) return { ok: false, error: "task is too long (max 20000 characters)" };

  const agents = Array.isArray(input.agents) ? input.agents.filter((a): a is string => typeof a === "string") : [];
  const known = new Set(loaded.config.agents.map((agent) => agent.id));
  const unknown = agents.filter((id) => !known.has(id));
  if (unknown.length > 0) return { ok: false, error: `unknown agent(s): ${unknown.join(", ")}` };
  if (new Set(agents).size < 2) return { ok: false, error: "pick at least two agents" };

  const maxRounds = Number(input.maxRounds ?? 3);
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 10) {
    return { ok: false, error: "maxRounds must be an integer from 1 to 10" };
  }

  const threshold = Number(input.threshold ?? 1);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return { ok: false, error: "threshold must be in (0, 1]" };
  }

  return { ok: true, value: { task, agents: [...new Set(agents)], maxRounds, threshold } };
}

/** Output paths for one run, resolved the same way `argue run` resolves them. */
export function runPathsFor(loaded: LoadedCliConfig, requestId: string): RunPaths {
  const plan = resolveRunPlan({
    loadedConfig: loaded,
    runInput: {},
    // Agents/task only satisfy validation; the paths depend on config + requestId alone.
    overrides: {
      requestId,
      task: "-",
      agents: loaded.config.agents.length >= 2 ? loaded.config.agents.map((a) => a.id) : ["a", "b"]
    }
  });
  return {
    requestId,
    jsonlPath: plan.jsonlPath,
    resultPath: plan.resultPath,
    summaryPath: plan.summaryPath,
    errorPath: plan.errorPath
  };
}

/** Lists runs (finished or still running) by scanning the directory that holds the `{requestId}` path segment. */
export async function listRuns(loaded: LoadedCliConfig): Promise<RunPaths[]> {
  if (loaded.config.agents.length < 2) return [];
  const template = runPathsFor(loaded, TOKEN_PLACEHOLDER).jsonlPath;
  const tokenIdx = template.indexOf(TOKEN_PLACEHOLDER);
  if (tokenIdx === -1) return [];

  // e.g. ".../out/{requestId}/events.jsonl": scan ".../out" for entries named like "{requestId}".
  const segmentStart = Math.max(template.lastIndexOf("/", tokenIdx), template.lastIndexOf("\\", tokenIdx)) + 1;
  if (segmentStart === 0) return [];
  const scanDir = template.slice(0, segmentStart - 1);
  const rest = template.slice(segmentStart);
  const segmentEnd = rest.search(/[\\/]/);
  const segment = segmentEnd === -1 ? rest : rest.slice(0, segmentEnd);
  const [before = "", after = ""] = segment.split(TOKEN_PLACEHOLDER);

  let entries: string[];
  try {
    entries = await readdir(scanDir);
  } catch {
    return [];
  }

  const runs: RunPaths[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(before) || !entry.endsWith(after)) continue;
    const requestId = entry.slice(before.length, entry.length - after.length);
    if (!REQUEST_ID_PATTERN.test(requestId)) continue;
    const paths = runPathsFor(loaded, requestId);
    if (await exists(paths.jsonlPath)) runs.push(paths);
  }
  return runs.sort((a, b) => b.requestId.localeCompare(a.requestId));
}

async function summarizeRun(paths: RunPaths): Promise<Record<string, unknown>> {
  const result = (await readJson(paths.resultPath)) as {
    status?: string;
    task?: { prompt?: string; title?: string };
    metrics?: { elapsedMs?: number };
  } | null;
  if (result) {
    return {
      requestId: paths.requestId,
      status: result.status ?? "unknown",
      title: result.task?.title ?? null,
      prompt: result.task?.prompt ?? null,
      elapsedMs: result.metrics?.elapsedMs ?? null
    };
  }

  // No result yet: still running, failed, or abandoned.
  const events = await readEvents(paths.jsonlPath);
  const last = events[events.length - 1]?.event as { type?: string } | undefined;
  const failed = (await exists(paths.errorPath)) || last?.type === "Failed";
  const idleMs = await stat(paths.jsonlPath).then(
    (info) => Date.now() - info.mtimeMs,
    () => 0 // not written yet: a run that is just starting
  );
  return {
    requestId: paths.requestId,
    status: failed ? "failed" : idleMs > STALE_AFTER_MS ? "stale" : "in_progress",
    title: null,
    prompt: null,
    elapsedMs: null
  };
}

function describeLaunch(run: LaunchedRun | undefined): Record<string, unknown> | null {
  if (!run) return null;
  return {
    state: run.state,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    stderrTail: run.stderrTail,
    task: run.task
  };
}

type LoggedEvent = { seq?: number; loggedAt?: string; event?: Record<string, unknown> };

async function readEvents(path: string): Promise<LoggedEvent[]> {
  let raw: string;
  try {
    raw = await readFileShared(path);
  } catch {
    return [];
  }
  const out: LoggedEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as LoggedEvent);
    } catch {
      // a partially written last line; it will be complete on the next poll
    }
  }
  return out;
}

/** Reads a file that another process may be appending to. */
function readFileShared(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    createReadStream(path, { encoding: "utf8" })
      .on("data", (chunk) => (data += String(chunk)))
      .on("error", reject)
      .on("end", () => resolve(data));
  });
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Stops a run and the agent CLIs it spawned (on Windows, child.kill() would leave them running). */
function killTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    nodeSpawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  child.kill("SIGTERM");
}
