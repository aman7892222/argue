import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DESK_THEMES, loadWorkspaceConfig, type DeskTheme, type LoadedCliConfig } from "../config.js";
import { newRequestId, REQUEST_ID_PATTERN } from "../request-id.js";
import { resolveOutputPaths, resolveRunPlan } from "../run-plan.js";
import {
  cachedModelLabels,
  catalogId,
  detectClis,
  KNOWN_CLIS,
  modelLabel,
  modelsCachePath,
  saveModelsCache,
  withCachedListings,
  type DetectedCli
} from "../cli-catalog.js";
import { checkClaudeUsageNow, readSeatUsage } from "../usage.js";
import { addSeat, parseAddSeatRequest, parseSeatPick, removeSeat, saveSeatPick, updateConfig } from "./seats.js";
import {
  chooseFolderDialog,
  findPdfBrowser,
  libraryDir,
  listLibrary,
  openWithOs,
  readSaved,
  saveToLibrary
} from "./library.js";
import { renderUiPage } from "./page.js";
import type { ReportSeat } from "./report.js";

const TOKEN_PLACEHOLDER = "{requestId}";
const MAX_BODY_BYTES = 64 * 1024;
// Starting a debate can carry attachments (base64): up to 60 MB of files.
const MAX_RUN_BODY_BYTES = 90 * 1024 * 1024;
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
  /** Where the last model listing is kept between launches (defaults to ~/.argue/models-cache.json). */
  modelsCachePath?: string;
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
  settings?: StartRequest["settings"];
  saved?: { folder: string; pdf: boolean };
  saveError?: string;
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
  // The full model listing takes seconds (it runs agy models, codex debug models...): one run is
  // shared until the page asks to scan again, and kept on disk for the next launch.
  const cachePath = options.modelsCachePath ?? modelsCachePath();
  let listing: Promise<DetectedCli[]> | null = null;
  const listClis = (fresh: boolean): Promise<DetectedCli[]> => {
    if (!listing || fresh) {
      const run = detectClis({ list: true });
      listing = run;
      run.then(
        (detected) => saveModelsCache(cachePath, detected).catch(() => undefined),
        () => {
          if (listing === run) listing = null;
        }
      );
    }
    return listing;
  };
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
      // The saved theme goes into the page itself, so it paints in the right colours at once.
      let theme: DeskTheme = "system";
      try {
        theme = (await loadConfig()).config.desk?.theme ?? "system";
      } catch {
        // a broken config is reported by /api/config; the page still opens
      }
      res.end(renderUiPage({ theme }));
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
      // asks the CLI for its catalog; it does not send any prompt or spend tokens. Without ?list=1
      // it only looks for the CLIs, filling in what they listed last time.
      const detected =
        url.searchParams.get("list") === "1"
          ? await listClis(url.searchParams.get("fresh") === "1")
          : await withCachedListings(cachePath, await detectClis({ list: false }));
      sendJson(res, 200, {
        clis: detected.map((d) => ({
          id: catalogId(d.cli),
          cliType: d.cli.cliType,
          unrestricted: d.cli.unrestricted ?? null,
          unverified: !!d.cli.unverified,
          label: d.cli.label,
          command: d.cli.command,
          installed: !!d.path,
          path: d.path,
          models: d.models,
          modelHint: d.cli.modelHint ?? null,
          efforts: d.efforts,
          effortsByModel: d.effortsByModel,
          effortInModel: !!d.cli.effortInModelName,
          // Its model list comes from the CLI itself, so it may still be loading.
          canList: !!(d.cli.listModelsArgs && d.cli.parseModels),
          modelInfo: d.modelInfo,
          modelAliases: d.cli.modelAliases ?? {},
          note: d.cli.note ?? null,
          install: d.cli.install
        }))
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/seats") {
      const parsed = parseAddSeatRequest(await readBody(req), KNOWN_CLIS);
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
            cliType: provider?.type === "cli" ? provider.cliType : null,
            // Lets the page match a custom seat to its catalog entry and theme (e.g. "ollama").
            command: provider?.type === "cli" && provider.command ? commandName(provider.command) : null,
            // Known before the (slower) CLI scan, so the model + effort pickers never change shape.
            effortInModel:
              provider?.type === "cli" &&
              KNOWN_CLIS.some((cli) => !cli.id && cli.cliType === provider.cliType && cli.effortInModelName)
          };
        }),
        defaults: {
          agents: loaded.config.defaults?.defaultAgents ?? loaded.config.agents.map((agent) => agent.id),
          maxRounds: loaded.config.defaults?.maxRounds ?? 3,
          threshold: loaded.config.defaults?.consensusThreshold ?? 1
        },
        // The model and effort last picked for each seat on this desk.
        picks: loaded.config.desk?.seats ?? {}
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/usage/claude/check") {
      const loaded = await loadConfig();
      const provider = Object.values(loaded.config.providers).find((p) => p.type === "cli" && p.cliType === "claude");
      const command = provider?.type === "cli" ? (provider.command ?? "claude") : "claude";
      sendJson(res, 200, await checkClaudeUsageNow({ command }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/usage") {
      const loaded = await loadConfig();
      // One entry per CLI kind, listing the agents that draw on that subscription.
      const seats = new Map<string, string[]>();
      let codexCommand: string | undefined;
      let claudeCommand: string | undefined;
      let agyCommand: string | undefined;
      const agyModels: string[] = [];
      for (const agent of loaded.config.agents) {
        const provider = loaded.config.providers[agent.provider];
        if (provider?.type !== "cli") continue;
        seats.set(provider.cliType, [...(seats.get(provider.cliType) ?? []), agent.id]);
        if (provider.cliType === "codex") codexCommand ??= provider.command ?? "codex";
        if (provider.cliType === "claude") claudeCommand ??= provider.command ?? "claude";
        if (provider.cliType === "antigravity") {
          agyCommand ??= provider.command ?? "agy";
          const picked = (loaded.config.desk?.seats as Record<string, { model?: string }> | undefined)?.[agent.id]
            ?.model;
          agyModels.push(agent.model, ...(picked ? [picked] : []));
        }
      }
      // The page asks every minute (every 15 s while a debate runs). Codex's and Claude's limits
      // come live from their accounts (no prompt).
      const usage = await readSeatUsage([...seats.keys()], {
        liveClaude: { command: claudeCommand ?? "claude" },
        ...(agyCommand ? { liveAntigravity: { command: agyCommand, models: agyModels } } : {}),
        ...(codexCommand ? { liveCodex: { command: codexCommand } } : {})
      });
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
      const library = await listLibrary(libraryDir(loaded));
      const savedById = new Map(library.map((entry) => [entry.requestId, entry]));
      const summaries: Array<Record<string, unknown>> = await Promise.all(
        runs.map(async (paths) => ({
          ...(await summarizeRun(paths)),
          saved: savedById.has(paths.requestId),
          process: describeLaunch(launched.get(paths.requestId))
        }))
      );
      // Saved debates whose working files are gone (moved machine, cleaned out/) still show up.
      for (const entry of library) {
        if (runs.some((run) => run.requestId === entry.requestId)) continue;
        summaries.push({
          requestId: entry.requestId,
          status: entry.status,
          title: entry.title,
          prompt: null,
          elapsedMs: null,
          saved: true,
          process: null
        });
      }
      summaries.sort((a, b) => String(b.requestId).localeCompare(String(a.requestId)));
      sendJson(res, 200, { runs: summaries });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/desk/theme") {
      // Kept in the workspace config: the desk runs on a new port each time, so browser storage forgets it.
      const body = (await readBody(req)) as { theme?: unknown } | null;
      const theme = DESK_THEMES.find((t) => t === body?.theme);
      if (!theme) {
        sendJson(res, 400, { error: `theme must be one of ${DESK_THEMES.join(", ")}` });
        return;
      }
      const loaded = await loadConfig();
      await updateConfig(loaded.configPath, (config) => {
        config.desk = { ...config.desk, theme };
      });
      sendJson(res, 200, { theme });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/desk/seat") {
      // A seat's model/effort pick, kept in the config for the same reason as the theme.
      const loaded = await loadConfig();
      const parsed = parseSeatPick(
        await readBody(req),
        loaded.config.agents.map((agent) => agent.id)
      );
      if (!parsed.ok) {
        sendJson(res, 400, { error: parsed.error });
        return;
      }
      await saveSeatPick(loaded.configPath, parsed.id, parsed.pick);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname.startsWith("/api/library")) {
      await handleLibrary(req, res, url);
      return;
    }

    const runMatch = /^\/api\/runs\/([^/]+)(?:\/(stop|save|open))?$/.exec(url.pathname);
    if (runMatch) {
      const requestId = decodeURIComponent(runMatch[1]!);
      if (!REQUEST_ID_PATTERN.test(requestId)) {
        sendJson(res, 400, { error: "invalid request id" });
        return;
      }
      const action = runMatch[2];

      if (action === "stop" && req.method === "POST") {
        const run = launched.get(requestId);
        if (!run || run.state !== "running") {
          sendJson(res, 409, { error: "run is not running in this UI session" });
          return;
        }
        killTree(run.child);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (action === "save" && req.method === "POST") {
        const loaded = await loadConfig();
        try {
          sendJson(res, 200, await saveRun(loaded, requestId, launched.get(requestId)?.settings, cachePath));
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (action === "open" && req.method === "POST") {
        // Opens this debate's saved PDF / HTML / folder with the OS. Only files inside its library folder.
        const loaded = await loadConfig();
        const body = (await readBody(req)) as { what?: unknown } | null;
        const entry = (await listLibrary(libraryDir(loaded))).find((e) => e.requestId === requestId);
        if (!entry) {
          sendJson(res, 404, { error: "this debate is not saved yet" });
          return;
        }
        const what = body?.what;
        const target =
          what === "pdf"
            ? join(entry.folder, "report.pdf")
            : what === "html"
              ? join(entry.folder, "report.html")
              : entry.folder;
        openWithOs(target);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (!action && req.method === "GET") {
        const loaded = await loadConfig();
        const paths = runPathsFor(loaded, requestId);
        const since = Number(url.searchParams.get("since") ?? "0");
        const events = await readEvents(paths.jsonlPath);
        let result = await readJson(paths.resultPath);
        const entry = (await listLibrary(libraryDir(loaded))).find((e) => e.requestId === requestId);
        const run = launched.get(requestId);
        // Saved debates carry the seats they ran with; they are read only when needed.
        const saved = entry && (!result || !run) ? await readSaved(entry.folder) : null;
        if (!result && saved) result = saved.result;
        sendJson(res, 200, {
          requestId,
          events: events.filter((event) => typeof event.seq === "number" && event.seq >= since),
          result,
          error: await readJson(paths.errorPath),
          process: describeLaunch(run),
          saved: entry ? { folder: entry.folder, hasPdf: entry.hasPdf } : null,
          attachments: await listAttachmentNames(attachmentsDirFor(paths, requestId)),
          // The model and effort each seat used in this debate (null when it was run elsewhere).
          seats: run ? seatsUsed(loaded, run.settings) : (saved?.seats ?? null)
        });
        return;
      }
    }

    if (req.method === "POST" && url.pathname === "/api/runs") {
      const body = await readBody(req, MAX_RUN_BODY_BYTES);
      const loaded = await loadConfig();
      const request = parseStartRequest(body, loaded);
      if (!request.ok) {
        sendJson(res, 400, { error: request.error });
        return;
      }
      const files = parseAttachments((body as { attachments?: unknown } | null)?.attachments);
      if (!files.ok) {
        sendJson(res, 400, { error: files.error });
        return;
      }

      const requestId = newRequestId();
      // Validate the plan up front so bad input fails here, not inside the child process.
      resolveRunPlan({
        loadedConfig: loaded,
        runInput: {},
        overrides: { requestId, task: request.value.task, agents: request.value.agents }
      });

      // Attachments live with the run's own files, in this user's workspace.
      const attachDir = attachmentsDirFor(runPathsFor(loaded, requestId), requestId);
      const attachPaths: string[] = [];
      if (files.value.length) {
        await mkdir(attachDir, { recursive: true });
        for (const file of files.value) {
          const path = join(attachDir, file.name);
          await writeFile(path, file.data, { flag: "wx" });
          attachPaths.push(path);
        }
      }

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
        ...attachPaths.flatMap((path) => ["--attach", path]),
        "--no-color"
      ];
      const child = nodeSpawn(runCommand.command, args, {
        cwd: loaded.configDir,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
        // Own process group on macOS/Linux, so Stop/Quit can end the agent CLIs too (see killTree).
        detached: process.platform !== "win32"
      });
      const run: LaunchedRun = {
        requestId,
        child,
        state: "running",
        exitCode: null,
        stderrTail: [],
        startedAt: new Date().toISOString(),
        task: request.value.task,
        settings: request.value.settings
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
        // Finished debates go to the library (PDF + HTML + JSON) automatically.
        if (code === 0) {
          void saveRun(loaded, requestId, run.settings, cachePath).then(
            (saved) => (run.saved = saved),
            (error: unknown) => (run.saveError = error instanceof Error ? error.message : String(error))
          );
        }
      });
      launched.set(requestId, run);

      sendJson(res, 201, { requestId });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  }

  /** /api/library: where finished debates are saved (each user picks their own folder). */
  async function handleLibrary(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const loaded = await loadConfig();
    const dir = libraryDir(loaded);

    if (req.method === "GET" && url.pathname === "/api/library") {
      sendJson(res, 200, {
        dir,
        count: (await listLibrary(dir)).length,
        pdf: !!(await findPdfBrowser())
      });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/library/choose" || url.pathname === "/api/library/dir")) {
      let chosen: string | null;
      if (url.pathname === "/api/library/choose") {
        chosen = await chooseFolderDialog();
        if (!chosen) {
          sendJson(res, 200, { cancelled: true, dir });
          return;
        }
      } else {
        const body = (await readBody(req)) as { dir?: unknown } | null;
        chosen = typeof body?.dir === "string" ? body.dir.trim() : "";
        if (!chosen || !isAbsolute(chosen) || /[\r\n]/.test(chosen)) {
          sendJson(res, 400, { error: "enter a full folder path, e.g. D:\\Debates" });
          return;
        }
      }
      try {
        await mkdir(chosen, { recursive: true });
        await updateConfig(loaded.configPath, (config) => {
          config.library = { dir: chosen };
        });
      } catch (error) {
        sendJson(res, 400, {
          error: `can't use that folder: ${error instanceof Error ? error.message : String(error)}`
        });
        return;
      }
      sendJson(res, 200, { dir: chosen });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/library/open") {
      await mkdir(dir, { recursive: true });
      openWithOs(dir);
      sendJson(res, 200, { ok: true });
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

/** Saves a finished run (or re-renders a saved one) into the library. */
async function saveRun(
  loaded: LoadedCliConfig,
  requestId: string,
  settings: StartRequest["settings"] | undefined,
  cachePath: string
): Promise<{ folder: string; pdf: boolean }> {
  const paths = runPathsFor(loaded, requestId);
  const result = (await readJson(paths.resultPath)) as (Record<string, unknown> & { requestId?: string }) | null;
  if (!result) {
    const entry = (await listLibrary(libraryDir(loaded))).find((e) => e.requestId === requestId);
    const saved = entry ? await readSaved(entry.folder) : null;
    if (!saved) throw new Error("this debate has not finished, so there is nothing to save yet");
    return saveToLibrary({
      dir: libraryDir(loaded),
      result: saved.result,
      seats: saved.seats,
      attachments: saved.attachments
    });
  }
  const scoreboard = Array.isArray(result.scoreboard) ? (result.scoreboard as Array<{ participantId?: string }>) : [];
  const participants = new Set(scoreboard.map((s) => s.participantId));
  // Seats as they ran: this desk's launch settings, else what the library already recorded for
  // this debate, else the seats' current settings (a debate started somewhere else).
  const entry = settings ? undefined : (await listLibrary(libraryDir(loaded))).find((e) => e.requestId === requestId);
  const recorded = entry ? (await readSaved(entry.folder))?.seats : undefined;
  // Each seat keeps the name the desk shows for its model ("GPT-6-Luna"), for the saved report.
  const labels = await cachedModelLabels(cachePath);
  const seats = (recorded ?? seatsUsed(loaded, settings).filter((seat) => participants.has(seat.id))).map((seat) => {
    if (seat.label || !seat.model) return seat;
    const label = (seat.cli && labels[seat.cli]?.[seat.model]) || modelLabel(seat.model);
    return label !== seat.model ? { ...seat, label } : seat;
  });
  return saveToLibrary({
    dir: libraryDir(loaded),
    result,
    seats,
    attachments: await listAttachmentNames(attachmentsDirFor(paths, requestId))
  });
}

/** Each seat's model, effort and CLI for a run: the desk's picks for it, else the seat's own settings. */
function seatsUsed(loaded: LoadedCliConfig, settings?: StartRequest["settings"]): ReportSeat[] {
  return loaded.config.agents.map((agent) => {
    const provider = loaded.config.providers[agent.provider];
    const cli =
      provider?.type === "cli"
        ? provider.cliType === "text" && provider.command
          ? commandName(provider.command)
          : provider.cliType
        : provider?.type;
    const effort = settings?.[agent.id]?.effort ?? agent.reasoning;
    return { id: agent.id, model: settings?.[agent.id]?.model ?? agent.model, ...(effort ? { effort } : {}), cli };
  });
}

/** A run's attachments folder: <run folder>/attachments (or <id>-attachments for flat layouts). */
export function attachmentsDirFor(paths: RunPaths, requestId: string): string {
  const dir = dirname(paths.resultPath);
  return basename(dir) === requestId ? join(dir, "attachments") : join(dir, `${requestId}-attachments`);
}

async function listAttachmentNames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

const ATTACHMENT_TYPES = /\.(pdf|png|jpe?g|webp|gif|txt|md|csv)$/i;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL = 60 * 1024 * 1024;

/** Validates uploaded attachments: { name, data (base64) }[]. Names are reduced to a safe basename. */
export function parseAttachments(
  raw: unknown
): { ok: true; value: Array<{ name: string; data: Buffer }> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "attachments must be a list" };
  if (raw.length > MAX_ATTACHMENTS) return { ok: false, error: `attach at most ${MAX_ATTACHMENTS} files` };
  const out: Array<{ name: string; data: Buffer }> = [];
  const names = new Set<string>();
  let total = 0;
  for (const item of raw as Array<{ name?: unknown; data?: unknown }>) {
    if (typeof item?.name !== "string" || typeof item.data !== "string") return { ok: false, error: "bad attachment" };
    // Keep only the last path segment and harmless characters: no folders, no "..", no device names.
    let name = (item.name.split(/[\\/]/).pop() ?? "")
      .replace(/[^\w.\- ()]/g, "_")
      .replace(/^[.\s]+/, "")
      .slice(-100);
    if (!ATTACHMENT_TYPES.test(name))
      return { ok: false, error: `${item.name}: only PDF, image or text files can be attached` };
    const data = Buffer.from(item.data, "base64");
    if (!data.length) return { ok: false, error: `${name} is empty` };
    if (data.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: `${name} is larger than 25 MB` };
    total += data.length;
    if (total > MAX_ATTACHMENTS_TOTAL) return { ok: false, error: "attachments add up to more than 60 MB" };
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${n}-${name}`;
    names.add(name.toLowerCase());
    out.push({ name, data });
  }
  return { ok: true, value: out };
}

/** "C:\x\Ollama.EXE" -> "ollama" */
export function commandName(command: string): string {
  const base = command.split(/[\\/]/).pop() ?? command;
  return base.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
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

// The run list is fetched every few seconds; a result or event log is parsed again only when it changes.
const parsedCache = new Map<string, { stamp: string; value: unknown }>();

async function readCached<T>(path: string, parse: (path: string) => Promise<T>): Promise<T | null> {
  const info = await stat(path).catch(() => null);
  if (!info) return null;
  const stamp = `${info.mtimeMs}:${info.size}`;
  const cached = parsedCache.get(path);
  if (cached?.stamp === stamp) return cached.value as T;
  const value = await parse(path);
  parsedCache.set(path, { stamp, value });
  return value;
}

async function summarizeRun(paths: RunPaths): Promise<Record<string, unknown>> {
  const summary = await readCached(paths.resultPath, async (path) => {
    const result = (await readJson(path)) as {
      status?: string;
      task?: { prompt?: string; title?: string };
      metrics?: { elapsedMs?: number };
    } | null;
    return result
      ? {
          requestId: paths.requestId,
          status: result.status ?? "unknown",
          title: result.task?.title ?? null,
          prompt: result.task?.prompt ?? null,
          elapsedMs: result.metrics?.elapsedMs ?? null
        }
      : null;
  });
  if (summary) return summary;

  // No result yet: still running, failed, or abandoned.
  const lastType = await readCached(paths.jsonlPath, async (path) => {
    const events = await readEvents(path);
    return (events[events.length - 1]?.event as { type?: string } | undefined)?.type ?? null;
  });
  const failed = (await exists(paths.errorPath)) || lastType === "Failed";
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
    task: run.task,
    saved: run.saved ?? null,
    saveError: run.saveError ?? null
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

function readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
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
  // macOS/Linux: runs start in their own process group, so signal the whole group
  // (argue and every agent CLI it started), not just argue itself.
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // group already gone; fall through
    }
  }
  child.kill("SIGTERM");
}
