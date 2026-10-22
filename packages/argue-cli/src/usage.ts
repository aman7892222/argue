import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import spawn from "cross-spawn";

/**
 * Subscription usage for each seat, as far as each CLI reveals it:
 * - claude: read live from the account with the login Claude Code saved (the same usage request
 *   its `/usage` uses; no prompt). Failing that, every `--output-format stream-json` call reports
 *   a `rate_limit_event` with 5-hour / 7-day utilization, which argue keeps in a small ledger.
 * - codex: asked live from the account (`codex app-server`, no prompt) when the desk wants it;
 *   otherwise the newest `rate_limits` Codex wrote into its own session logs.
 * - antigravity: `agy -p "/usage"` prints the plan's quota table (no model turn); argue reads
 *   the rows that apply to the seat's model. Failing that, it counts the tokens it used itself.
 */

export type UsageWindow = {
  label: string;
  usedPercent: number;
  /** Unix seconds. */
  resetsAt: number | null;
};

export type SeatUsage = (
  | {
      kind: "limits";
      source: "claude" | "codex" | "antigravity";
      windows: UsageWindow[];
      observedAt: string | null;
      /** Read from the account just now, rather than from the CLI's last answer or log. */
      live?: boolean;
      /** Why the live read failed, when this came from the fallback instead. */
      note?: string;
      /** The desk can offer "Check now" (one tiny Claude reply) for this seat. */
      canCheck?: boolean;
    }
  | {
      kind: "tokens";
      source: "antigravity";
      date: string;
      totalTokens: number;
      calls: number;
      observedAt: string | null;
    }
  | { kind: "unknown"; source: string; reason: string; canCheck?: boolean }
) & {
  /** A live read is still running; this is the last known value. The desk asks again shortly. */
  pending?: boolean;
};

const PENDING = Symbol("pending");
/** Waits for a live read, but never longer than `ms`: a slow CLI must not hold up the page. */
function soft<T>(promise: Promise<T>, ms: number): Promise<T | typeof PENDING> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(PENDING), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(PENDING);
      }
    );
  });
}

type Ledger = {
  version: 1;
  claude?: { windows: UsageWindow[]; observedAt: string };
  antigravity?: { date: string; totalTokens: number; calls: number; observedAt: string };
};

export function usageLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.ARGUE_USAGE_FILE ?? join(homedir(), ".argue", "usage.json");
}

async function readLedger(path: string): Promise<Ledger> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Ledger;
    return parsed && parsed.version === 1 ? parsed : { version: 1 };
  } catch {
    return { version: 1 };
  }
}

// Seats run in parallel inside one argue process; serialize ledger updates.
let writeQueue: Promise<void> = Promise.resolve();

function updateLedger(mutate: (ledger: Ledger) => void, path = usageLedgerPath()): Promise<void> {
  const next = writeQueue.then(async () => {
    const ledger = await readLedger(path);
    mutate(ledger);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(ledger, null, 2));
    await rename(tmp, path);
  });
  // A failed write must never break a debate; usage is best-effort.
  writeQueue = next.catch(() => {});
  return writeQueue;
}

/** Parses Claude's `rate_limit_event.rate_limit_info` into windows. */
export function parseClaudeRateLimit(info: unknown): UsageWindow[] {
  const windows = (info as { unifiedWindows?: Record<string, { utilization?: unknown; resetsAt?: unknown }> })
    ?.unifiedWindows;
  if (!windows || typeof windows !== "object") return [];
  const labels: Record<string, string> = { five_hour: "5-hour", seven_day: "7-day" };
  return Object.entries(windows)
    .filter(([, w]) => typeof w?.utilization === "number")
    .map(([key, w]) => ({
      label: labels[key] ?? key.replaceAll("_", " "),
      usedPercent: Math.round((w.utilization as number) * 1000) / 10,
      resetsAt: typeof w.resetsAt === "number" ? w.resetsAt : null
    }));
}

export function recordClaudeRateLimit(info: unknown, now = new Date(), path?: string): Promise<void> {
  const windows = parseClaudeRateLimit(info);
  if (windows.length === 0) return Promise.resolve();
  return updateLedger((ledger) => {
    ledger.claude = { windows, observedAt: now.toISOString() };
  }, path);
}

export function recordAntigravityTokens(totalTokens: number, now = new Date(), path?: string): Promise<void> {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return Promise.resolve();
  const date = localDate(now);
  return updateLedger((ledger) => {
    const today = ledger.antigravity?.date === date ? ledger.antigravity : { date, totalTokens: 0, calls: 0 };
    ledger.antigravity = {
      date,
      totalTokens: today.totalTokens + totalTokens,
      calls: today.calls + 1,
      observedAt: now.toISOString()
    };
  }, path);
}

/** Codex session logs: newest `rate_limits` snapshot. */
export async function readCodexRateLimits(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ windows: UsageWindow[]; observedAt: string | null } | null> {
  const root = join(env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
  const files = await newestFiles(root, 3, 8);
  for (const file of files) {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      if (!line.includes('"rate_limits"')) continue;
      try {
        const entry = JSON.parse(line) as { timestamp?: string };
        const limits = findRateLimits(entry);
        if (!limits) continue;
        const windows = [limits.primary, limits.secondary]
          .filter((w): w is CodexWindow => !!w && typeof w.used_percent === "number")
          .map((w) => ({
            label: formatWindow(w.window_minutes),
            usedPercent: w.used_percent,
            resetsAt: typeof w.resets_at === "number" ? w.resets_at : null
          }));
        if (windows.length > 0) return { windows, observedAt: entry.timestamp ?? null };
      } catch {
        // partial line
      }
    }
  }
  return null;
}

type CodexWindow = { used_percent: number; window_minutes?: number; resets_at?: number };

type LiveWindow = { usedPercent?: unknown; windowDurationMins?: unknown; resetsAt?: unknown };

/**
 * Codex's current limits straight from the account: `codex app-server`, request
 * `account/rateLimits/read`. That is an account read, with no prompt and no model turn, so the
 * desk can ask every minute. Resolves null when Codex is missing, signed out or slow.
 */
export function readCodexLiveRateLimits(
  options: { command?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; now?: () => Date } = {}
): Promise<{ windows: UsageWindow[]; observedAt: string } | null> {
  const now = options.now ?? (() => new Date());
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(options.command ?? "codex", ["app-server"], {
        env: options.env ?? process.env,
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true
      });
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: { windows: UsageWindow[]; observedAt: string } | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Closing its input lets the app server exit by itself; stop it only if it lingers.
      child.stdin?.end();
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      }, 3_000).unref();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), options.timeoutMs ?? 15_000);
    child.on("error", () => finish(null));
    child.on("close", () => finish(null));
    const send = (message: unknown): void => {
      child.stdin?.write(`${JSON.stringify(message)}\n`);
    };

    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        let message: { id?: unknown; result?: { rateLimits?: { primary?: LiveWindow; secondary?: LiveWindow } } };
        try {
          message = JSON.parse(line) as typeof message;
        } catch {
          continue;
        }
        if (message.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "account/rateLimits/read" });
        } else if (message.id === 2) {
          const limits = message.result?.rateLimits;
          const windows = [limits?.primary, limits?.secondary]
            .filter((w): w is LiveWindow => !!w && typeof w.usedPercent === "number")
            .map((w) => ({
              label: formatWindow(typeof w.windowDurationMins === "number" ? w.windowDurationMins : undefined),
              usedPercent: w.usedPercent as number,
              resetsAt: typeof w.resetsAt === "number" ? w.resetsAt : null
            }));
          finish(windows.length ? { windows, observedAt: now().toISOString() } : null);
        }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "argue-desk", version: "1" } } });
  });
}

// The desk asks every minute, and after each answer: one live read serves every request inside
// that time, so Codex is asked at most about once a minute.
const LIVE_CODEX_MAX_AGE_MS = 50_000;
let liveCodex: { at: number; command: string; read: ReturnType<typeof readCodexLiveRateLimits> } | null = null;

function liveCodexLimits(
  command: string,
  env: NodeJS.ProcessEnv,
  now: Date
): ReturnType<typeof readCodexLiveRateLimits> {
  if (!liveCodex || liveCodex.command !== command || now.getTime() - liveCodex.at > LIVE_CODEX_MAX_AGE_MS) {
    liveCodex = { at: now.getTime(), command, read: readCodexLiveRateLimits({ command, env }) };
  }
  return liveCodex.read;
}

/** Claude Code's saved login: ~/.claude/.credentials.json, or the macOS Keychain. */
type ClaudeOAuth = { accessToken?: unknown; expiresAt?: unknown };

async function readClaudeOAuth(env: NodeJS.ProcessEnv): Promise<ClaudeOAuth | null> {
  const dir = env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  const parse = (raw: string): ClaudeOAuth | null => {
    try {
      const oauth = (JSON.parse(raw) as { claudeAiOauth?: ClaudeOAuth }).claudeAiOauth;
      return oauth && typeof oauth.accessToken === "string" ? oauth : null;
    } catch {
      return null;
    }
  };
  try {
    const fromFile = parse(await readFile(join(dir, ".credentials.json"), "utf8"));
    if (fromFile) return fromFile;
  } catch {
    // no file: macOS keeps it in the Keychain
  }
  if (process.platform !== "darwin") return null;
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 5_000, windowsHide: true },
      (error, stdout) => resolve(error ? null : parse(String(stdout).trim()))
    );
  });
}

type ClaudeUsageWindow = { utilization?: unknown; resets_at?: unknown } | null | undefined;

/** Parses the account usage response (`utilization` is a percentage, `resets_at` an ISO time). */
export function parseClaudeAccountUsage(body: unknown): UsageWindow[] {
  const record = body as Record<string, ClaudeUsageWindow> | null;
  if (!record || typeof record !== "object") return [];
  const labels: Array<[string, string]> = [
    ["five_hour", "5-hour"],
    ["seven_day", "7-day"]
  ];
  const out: UsageWindow[] = [];
  for (const [key, label] of labels) {
    const w = record[key];
    if (!w || typeof w.utilization !== "number") continue;
    const reset = typeof w.resets_at === "string" ? Date.parse(w.resets_at) : NaN;
    out.push({
      label,
      usedPercent: Math.round(w.utilization * 10) / 10,
      resetsAt: Number.isFinite(reset) ? Math.floor(reset / 1000) : null
    });
  }
  return out;
}

export type ClaudeLiveFailure = "no_login" | "expired" | "rejected" | "unreachable";
export type ClaudeLiveResult =
  | { windows: UsageWindow[]; observedAt: string }
  | { failure: ClaudeLiveFailure; status?: number };

let claudeVersion: Promise<string> | null = null;
/** Claude Code's version, for the same request identity Claude Code itself sends. */
function detectClaudeVersion(command: string, env: NodeJS.ProcessEnv): Promise<string> {
  claudeVersion ??= new Promise((resolve) => {
    let out = "";
    try {
      const child = spawn(command, ["--version"], { env, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
      const timer = setTimeout(() => child.kill(), 5_000);
      child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
      child.on("error", () => resolve("2.1.0"));
      child.on("close", () => {
        clearTimeout(timer);
        resolve(/\d+\.\d+\.\d+/.exec(out)?.[0] ?? "2.1.0");
      });
    } catch {
      resolve("2.1.0");
    }
  });
  return claudeVersion;
}

/**
 * Claude's current limits straight from the account, using the login Claude Code saved: the
 * same request Claude Code's `/usage` makes. No prompt and no model turn. Read-only: an expired
 * login is left for Claude Code to renew (it does whenever it runs). Says why when it can't.
 */
export async function readClaudeLiveUsage(
  options: {
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    oauth?: ClaudeOAuth | null;
    command?: string;
    version?: string;
  } = {}
): Promise<ClaudeLiveResult> {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  let oauth: ClaudeOAuth | null;
  try {
    oauth = options.oauth !== undefined ? options.oauth : await readClaudeOAuth(env);
  } catch {
    oauth = null;
  }
  if (!oauth || typeof oauth.accessToken !== "string") return { failure: "no_login" };
  if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= now().getTime() + 30_000) return { failure: "expired" };
  try {
    const version = options.version ?? (await detectClaudeVersion(options.command ?? "claude", env));
    const response = await (options.fetchImpl ?? fetch)("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": `claude-cli/${version} (external, cli)`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000)
    });
    if (!response.ok) return { failure: response.status === 401 ? "expired" : "rejected", status: response.status };
    const windows = parseClaudeAccountUsage(await response.json());
    return windows.length
      ? { windows, observedAt: now().toISOString() }
      : { failure: "rejected", status: response.status };
  } catch {
    return { failure: "unreachable" };
  }
}

export function claudeFailureText(result: { failure: ClaudeLiveFailure; status?: number }): string {
  switch (result.failure) {
    case "no_login":
      return "Claude Code isn't signed in on this computer (no saved login found). Run claude auth login once.";
    case "expired":
      return "Claude Code's saved login has expired. Claude Code renews it whenever it runs: click Check now, or it updates after Claude's next answer.";
    case "rejected":
      return `Your Claude account didn't answer the usage check (HTTP ${result.status ?? "?"}). Click Check now, or it updates after Claude's next answer.`;
    default:
      return "Couldn't reach Claude's servers to check usage. It updates after Claude's next answer.";
  }
}

/**
 * "Check now": one tiny Claude reply (Haiku, no tools). Running Claude Code renews its own saved
 * login, and the reply reports the plan's rate limits, which go into the ledger. Uses a sliver of
 * the plan, so the desk only does this when asked.
 */
export function checkClaudeUsageNow(
  options: { command?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        options.command ?? "claude",
        [
          "-p",
          "--output-format",
          "stream-json",
          "--verbose",
          "--model",
          "haiku",
          "--max-turns",
          "1",
          "--tools",
          "",
          "--strict-mcp-config",
          "--disable-slash-commands"
        ],
        { env: options.env ?? process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
      );
    } catch {
      resolve({ ok: false, message: "Couldn't start Claude Code." });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 60_000);
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.stdin?.on("error", () => undefined);
    child.on("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: false, message: "Couldn't start Claude Code." });
      }
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      let info: unknown = null;
      let result = "";
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith("{")) continue;
        try {
          const event = JSON.parse(line) as { type?: string; rate_limit_info?: unknown; result?: unknown };
          if (event.type === "rate_limit_event") info = event.rate_limit_info;
          if (event.type === "result" && typeof event.result === "string") result = event.result;
        } catch {
          // partial line
        }
      }
      liveClaude = null; // the login may have been renewed: read the account again next time
      const ledgerPath = usageLedgerPath(options.env ?? process.env);
      const done = info ? recordClaudeRateLimit(info, new Date(), ledgerPath) : Promise.resolve();
      void done.then(() =>
        resolve(
          info
            ? { ok: true }
            : {
                ok: false,
                message: (result || stderr).trim().split(/\r?\n/)[0]?.slice(0, 200) || "Claude didn't report usage."
              }
        )
      );
    });
    child.stdin?.end("Reply with just: ok");
  });
}

// The desk asks often while a debate runs; one live read serves every request inside this time.
const LIVE_CLAUDE_MAX_AGE_MS = 10_000;
let liveClaude: { at: number; read: ReturnType<typeof readClaudeLiveUsage> } | null = null;

function liveClaudeUsage(env: NodeJS.ProcessEnv, now: Date, command: string): ReturnType<typeof readClaudeLiveUsage> {
  if (!liveClaude || now.getTime() - liveClaude.at > LIVE_CLAUDE_MAX_AGE_MS) {
    const read = readClaudeLiveUsage({ env, command });
    liveClaude = { at: now.getTime(), read };
    // Keep the ledger current too, so a later offline read starts from this.
    void read.then((r) => {
      if ("windows" in r)
        void updateLedger(
          (ledger) => (ledger.claude = { windows: r.windows, observedAt: r.observedAt }),
          usageLedgerPath(env)
        );
    });
  }
  return liveClaude.read;
}

/** Test hook: forget the cached live reads. */
export function resetLiveUsageCache(): void {
  liveClaude = null;
  liveAgy = null;
  lastAgy = null;
  claudeVersion = null;
  liveCodex = null;
}

/** One row of `agy -p "/usage"`: "Gemini Models   Weekly Limit Remaining   100%   2026-10-26 00:30 IST". */
export type AgyQuotaRow = { group: string; limit: string; remainingPercent: number; resetsAt: number | null };

/** Parses agy's quota table. Reset times are printed in this computer's local time. */
export function parseAgyQuota(text: string): AgyQuotaRow[] {
  const rows: AgyQuotaRow[] = [];
  const pattern = /^(.+?)\s{2,}(.+?)\s{2,}(\d+(?:\.\d+)?)%(?:\s+(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}))?/;
  for (const raw of text.split(/\r?\n/)) {
    const m = pattern.exec(raw.trim());
    if (!m) continue;
    const reset = m[4]
      ? new Date(Number(m[4]), Number(m[5]) - 1, Number(m[6]), Number(m[7]), Number(m[8])).getTime() / 1000
      : null;
    rows.push({ group: m[1]!.trim(), limit: m[2]!.trim(), remainingPercent: Number(m[3]), resetsAt: reset });
  }
  return rows;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The rows that limit these models, as usage windows: 5-hour first, then the tightest weekly. */
export function agyWindowsFor(rows: AgyQuotaRow[], models: string[]): UsageWindow[] {
  const wanted = models.map(norm).filter(Boolean);
  const applies = (group: string): boolean => {
    if (!wanted.length) return true;
    const g = norm(group);
    if (g === "geminimodels") return wanted.some((m) => m.includes("gemini"));
    if (g === "claudeandgptmodels") return wanted.some((m) => m.includes("claude") || m.includes("gpt"));
    return wanted.some((m) => m.includes(g));
  };
  const windows = rows
    .filter((r) => applies(r.group))
    .map((r) => {
      const weekly = /week/i.test(r.limit);
      const fiveHour = /five hour|5[- ]?hour/i.test(r.limit);
      const generic = /models$/i.test(r.group);
      const span = weekly ? "7-day" : fiveHour ? "5-hour" : r.limit.replace(/\s*remaining$/i, "");
      return {
        label: generic && wanted.length ? span : `${r.group} ${span}`,
        usedPercent: Math.max(0, Math.min(100, Math.round((100 - r.remainingPercent) * 10) / 10)),
        resetsAt: r.resetsAt,
        order: fiveHour ? 0 : weekly ? 1 : 2
      };
    });
  windows.sort((a, b) => a.order - b.order || b.usedPercent - a.usedPercent);
  return windows.map(({ order: _order, ...w }) => w);
}

/** Runs `agy -p "/usage"` (prints the quota table; no model turn). Null when agy is missing or slow. */
export function readAgyQuota(
  options: { command?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<AgyQuotaRow[] | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(options.command ?? "agy", ["-p", "/usage"], {
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    let settled = false;
    const finish = (value: AgyQuotaRow[] | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, options.timeoutMs ?? 30_000);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => (out += d));
    child.on("error", () => finish(null));
    child.on("close", () => {
      const rows = parseAgyQuota(out.slice(Math.max(0, out.lastIndexOf("Quota:"))));
      finish(rows.length ? rows : null);
    });
  });
}

// agy takes a few seconds to start; one read serves the desk's requests for this long.
const LIVE_AGY_MAX_AGE_MS = 50_000;
let lastAgy: { rows: AgyQuotaRow[]; observedAt: string } | null = null;
let liveAgy: { at: number; command: string; read: Promise<{ rows: AgyQuotaRow[]; observedAt: string } | null> } | null =
  null;

function liveAgyQuota(
  command: string,
  env: NodeJS.ProcessEnv,
  now: Date
): Promise<{ rows: AgyQuotaRow[]; observedAt: string } | null> {
  if (!liveAgy || liveAgy.command !== command || now.getTime() - liveAgy.at > LIVE_AGY_MAX_AGE_MS) {
    const observedAt = now.toISOString();
    liveAgy = {
      at: now.getTime(),
      command,
      read: readAgyQuota({ command, env }).then((rows) => {
        const value = rows ? { rows, observedAt } : null;
        if (value) lastAgy = value;
        return value;
      })
    };
  }
  return liveAgy.read;
}

function findRateLimits(value: unknown, depth = 0): { primary?: CodexWindow; secondary?: CodexWindow } | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const record = value as Record<string, unknown>;
  if (record.rate_limits && typeof record.rate_limits === "object") {
    return record.rate_limits as { primary?: CodexWindow; secondary?: CodexWindow };
  }
  for (const child of Object.values(record)) {
    const found = findRateLimits(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function formatWindow(minutes: number | undefined): string {
  if (!minutes) return "window";
  if (minutes === 10080) return "weekly";
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-min`;
}

/** Walks a date-sharded tree (YYYY/MM/DD/*.jsonl) newest-first and returns up to `limit` files. */
async function newestFiles(root: string, depth: number, limit: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, level: number): Promise<void> {
    if (out.length >= limit) return;
    let entries: string[];
    try {
      entries = (await readdir(dir)).sort().reverse();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const path = join(dir, entry);
      if (level < depth) await walk(path, level + 1);
      else if (entry.endsWith(".jsonl")) out.push(path);
    }
  }
  await walk(root, 0);
  return out;
}

/** Usage for every cliType that has a source; a window whose reset time has passed reads as 0%. */
export async function readSeatUsage(
  cliTypes: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    now?: Date;
    /** Ask Codex's account for its current limits (the desk), with this command. */
    liveCodex?: { command: string };
    /** Ask Claude's account for its current limits (the desk), with Claude Code's saved login. */
    liveClaude?: boolean | { command: string };
    /** Read agy's quota table (the desk), with this command, for these models. */
    liveAntigravity?: { command: string; models: string[] };
    /** How long to wait for each live read before answering with the last known value. */
    softDeadlineMs?: number;
  } = {}
): Promise<Record<string, SeatUsage>> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const ledger = await readLedger(usageLedgerPath(env));
  const out: Record<string, SeatUsage> = {};
  const deadline = options.softDeadlineMs ?? 4_000;

  for (const cliType of new Set(cliTypes)) {
    if (cliType === "claude") {
      const command = typeof options.liveClaude === "object" ? options.liveClaude.command : "claude";
      const read = options.liveClaude ? await soft(liveClaudeUsage(env, now, command), deadline) : null;
      const pending = read === PENDING;
      const live = read === PENDING ? null : read;
      const note = live && "failure" in live ? claudeFailureText(live) : undefined;
      if (live && "windows" in live) {
        out.claude = {
          kind: "limits",
          source: "claude",
          windows: live.windows,
          observedAt: live.observedAt,
          live: true
        };
      } else if (ledger.claude && !allReset(ledger.claude.windows, now)) {
        out.claude = {
          kind: "limits",
          source: "claude",
          windows: rollOver(ledger.claude.windows, now),
          observedAt: ledger.claude.observedAt,
          ...(note ? { note, canCheck: true } : {}),
          ...(pending ? { pending: true } : {})
        };
      } else {
        // Every window in the last reading has reset since: showing 0% would be a guess.
        out.claude = {
          kind: "unknown",
          source: "claude",
          reason:
            note ??
            (pending
              ? "Checking your Claude account…"
              : ledger.claude
                ? "The last reading is from before your limits reset. It updates after Claude's next answer."
                : "Shown after the Claude seat's first answer."),
          ...(options.liveClaude && !pending ? { canCheck: true } : {}),
          ...(pending ? { pending: true } : {})
        };
      }
    } else if (cliType === "codex") {
      const read = options.liveCodex
        ? await soft(liveCodexLimits(options.liveCodex.command, env, now), deadline)
        : null;
      const pending = read === PENDING;
      const live = read === PENDING ? null : read;
      const codex = live ?? (await readCodexRateLimits(env));
      out.codex = codex
        ? {
            kind: "limits",
            source: "codex",
            windows: rollOver(codex.windows, now),
            observedAt: codex.observedAt,
            ...(live ? { live: true } : {}),
            ...(pending ? { pending: true } : {})
          }
        : {
            kind: "unknown",
            source: "codex",
            reason: pending ? "Checking your Codex account…" : "No Codex session logs with rate limits found yet.",
            ...(pending ? { pending: true } : {})
          };
    } else if (cliType === "antigravity") {
      const read = options.liveAntigravity
        ? await soft(liveAgyQuota(options.liveAntigravity.command, env, now), deadline)
        : null;
      const pending = read === PENDING;
      const quota = read === PENDING ? lastAgy : read;
      const windows = quota ? agyWindowsFor(quota.rows, options.liveAntigravity?.models ?? []) : [];
      if (quota && windows.length) {
        out.antigravity = {
          kind: "limits",
          source: "antigravity",
          windows: rollOver(windows, now),
          observedAt: quota.observedAt,
          live: true,
          ...(pending ? { pending: true } : {})
        };
        continue;
      }
      const today = localDate(now);
      const day = ledger.antigravity?.date === today ? ledger.antigravity : null;
      out.antigravity = {
        kind: "tokens",
        source: "antigravity",
        date: today,
        totalTokens: day?.totalTokens ?? 0,
        calls: day?.calls ?? 0,
        observedAt: day?.observedAt ?? null,
        ...(pending ? { pending: true } : {})
      };
    }
  }
  return out;
}

function allReset(windows: UsageWindow[], now: Date): boolean {
  const nowSeconds = now.getTime() / 1000;
  return windows.length > 0 && windows.every((w) => w.resetsAt !== null && w.resetsAt <= nowSeconds);
}

function rollOver(windows: UsageWindow[], now: Date): UsageWindow[] {
  const nowSeconds = now.getTime() / 1000;
  return windows.map((w) =>
    w.resetsAt !== null && w.resetsAt <= nowSeconds ? { ...w, usedPercent: 0, resetsAt: null } : w
  );
}

function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
