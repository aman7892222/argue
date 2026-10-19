import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { loadWorkspaceConfig, type LoadedCliConfig } from "../config.js";
import { newRequestId, REQUEST_ID_PATTERN } from "../request-id.js";
import { resolveOutputPaths, resolveRunPlan } from "../run-plan.js";
import { detectClis } from "../cli-catalog.js";
import { readSeatUsage } from "../usage.js";
import { addSeat, parseAddSeatRequest, removeSeat } from "./seats.js";
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
  /**
   * Shut down (stopping any debate it launched) once no page has called the API for this long.
   * The open page polls every few seconds, so this only fires after the tab is closed.
   */
  idleExitMs?: number;
};

export type UiServer = {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
  /** Resolves once the server has stopped (closed, idle timeout, or Quit from the page). */
  closed: Promise<void>;
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

  // Workspace loader: the desk must work with 0 or 1 seats while you are setting it up.
  const loadConfig = (): Promise<LoadedCliConfig> => loadWorkspaceConfig({ explicitPath: options.configPath });
  let lastSeen = Date.now();
  let resolveClosed: () => void = () => {};
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> =>
    (closing ??= new Promise<void>((resolve) => {
      clearInterval(idleTimer);
      for (const run of launched.values()) if (run.state === "running") killTree(run.child);
      server.close(() => {
        resolveClosed();
        resolve();
      });
      server.closeAllConnections();
    }));
  const idleTimer = setInterval(() => {
    if (options.idleExitMs && Date.now() - lastSeen > options.idleExitMs) void close();
  }, 5_000);
  idleTimer.unref();

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

    // Browsers send Origin on cross-site requests; only this page's own origin may call the API.
    const origin = req.headers.origin;
    if (origin !== undefined && !isLoopbackHost(origin.replace(/^http:\/\//, ""), port)) {
      sendJson(res, 403, { error: "forbidden origin" });
      return;
    }

    if (!tokenMatches(req.headers["x-argue-token"], token)) {
      sendJson(res, 401, { error: "missing or invalid token" });
      return;
    }
    lastSeen = Date.now();

    if (req.method === "POST" && url.pathname === "/api/shutdown") {
      sendJson(res, 200, { ok: true });
      setTimeout(() => void close(), 50);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/clis") {
      // Lists installed agent CLIs and their models. Model listing (agy models, codex debug models)
      // asks the CLI for its catalog; it does not send any prompt or spend tokens.
      const detected = await detectClis({ list: url.searchParams.get("list") === "1" });
      sendJson(res, 200, {
        clis: detected.map((d) => ({
          cliType: d.cli.cliType,
          label: d.cli.label,
          command: d.cli.command,
          installed: !!d.path,
          path: d.path,
          models: d.models,
          modelHint: d.cli.modelHint ?? null,
          efforts: d.efforts,
          effortsByModel: d.effortsByModel,
          modelNotes: d.cli.modelNotes ?? {},
          note: d.cli.note ?? null,
          install: d.cli.install
        }))
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/seats") {
      const parsed = parseAddSeatRequest(await readBody(req));
      if (!parsed.ok) {
        sendJson(res, 400, { error: parsed.error });
        return;
      }
      const loaded = await loadConfig();
      try {
        await addSeat(loaded.configPath, parsed.value);
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        return;
      }
      sendJson(res, 201, { ok: true });
      return;
    }

    const seatMatch = /^\/api\/seats\/([^/]+)$/.exec(url.pathname);
    if (seatMatch && req.method === "DELETE") {
      const loaded = await loadConfig();
      try {
        await removeSeat(loaded.configPath, decodeURIComponent(seatMatch[1]!));
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      const loaded = await loadConfig();
      sendJson(res, 200, {
        configPath: loaded.configPath,
        agents: loaded.config.agents.map((agent) => {
          const provider = loaded.config.providers[agent.provider];
          return {
            id: agent.id,
            provider: agent.provider,
            model: agent.model,
            role: agent.role,
            cliType: provider?.type === "cli" ? provider.cliType : null
          };
        }),
        defaults: {
          agents: loaded.config.defaults?.defaultAgents ?? loaded.config.agents.map((agent) => agent.id),
          maxRounds: loaded.config.defaults?.maxRounds ?? 3,
          threshold: loaded.config.defaults?.consensusThreshold ?? 1
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/usage") {
      const loaded = await loadConfig();
      // One entry per CLI kind, listing the agents that draw on that subscription.
      const seats = new Map<string, string[]>();
      for (const agent of loaded.config.agents) {
        const provider = loaded.config.providers[agent.provider];
        if (provider?.type !== "cli") continue;
        seats.set(provider.cliType, [...(seats.get(provider.cliType) ?? []), agent.id]);
      }
      const usage = await readSeatUsage([...seats.keys()]);
      sendJson(res, 200, {
        seats: [...seats.entries()].map(([cliType, agents]) => ({
          cliType,
          agents,
          usage: usage[cliType] ?? { kind: "unknown", source: cliType, reason: "This CLI does not report usage." }
        }))
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
        ...Object.entries(request.value.settings).flatMap(([id, s]) => [
          ...(s.model && request.value.agents.includes(id) ? ["--model-for", `${id}=${s.model}`] : []),
          ...(s.effort && request.value.agents.includes(id) ? ["--effort-for", `${id}=${s.effort}`] : [])
        ]),
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
    close,
    closed
  };
}

function defaultRunCommand(): { command: string; args: string[] } {
  // dist/ui/server.js -> dist/cli.js
  const cliEntry = fileURLToPath(new URL("../cli.js", import.meta.url));
  return { command: process.execPath, args: [cliEntry] };
}

/** Constant-time comparison, so response timing reveals nothing about the token. */
function tokenMatches(given: string | string[] | undefined, expected: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isLoopbackHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

type StartRequest = {
  task: string;
  agents: string[];
  maxRounds: number;
  threshold: number;
  settings: Record<string, { model?: string; effort?: string }>;
};

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

  // Per-seat model / effort for this debate only: { seatId: { model?, effort? } }.
  const settings: StartRequest["settings"] = {};
  if (input.settings !== undefined) {
    if (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) {
      return { ok: false, error: "settings must be an object keyed by seat" };
    }
    for (const [id, raw] of Object.entries(input.settings as Record<string, unknown>)) {
      if (!known.has(id)) return { ok: false, error: `settings: unknown seat ${id}` };
      const s = (raw ?? {}) as { model?: unknown; effort?: unknown };
      const model = typeof s.model === "string" ? s.model.trim() : "";
      const effort = typeof s.effort === "string" ? s.effort.trim() : "";
      if (model && (model.length > 200 || /[\s"'`]/.test(model)))
        return { ok: false, error: `settings: bad model for ${id}` };
      if (effort && !/^[a-z]+$/.test(effort)) return { ok: false, error: `settings: bad effort for ${id}` };
      settings[id] = { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
    }
  }

  return { ok: true, value: { task, agents: [...new Set(agents)], maxRounds, threshold, settings } };
}

/** Output paths for one run, resolved the same way `argue run` resolves them. */
export function runPathsFor(loaded: LoadedCliConfig, requestId: string): RunPaths {
  return { requestId, ...resolveOutputPaths(loaded, requestId) };
}

/** Lists runs (finished or still running) by scanning the directory that holds the `{requestId}` path segment. */
export async function listRuns(loaded: LoadedCliConfig): Promise<RunPaths[]> {
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
