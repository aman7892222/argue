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
 * - antigravity: agy reports token counts but not its quota, so argue can only count the
 *   tokens it used itself (per local day).
 */

export type UsageWindow = {
  label: string;
  usedPercent: number;
  /** Unix seconds. */
  resetsAt: number | null;
};

export type SeatUsage =
  | {
      kind: "limits";
      source: "claude" | "codex";
      windows: UsageWindow[];
      observedAt: string | null;
      /** Read from the account just now, rather than from the CLI's last answer or log. */
      live?: boolean;
    }
  | {
      kind: "tokens";
      source: "antigravity";
      date: string;
      totalTokens: number;
      calls: number;
      observedAt: string | null;
    }
  | { kind: "unknown"; source: string; reason: string };

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

/**
 * Claude's current limits straight from the account, using the login Claude Code saved: the
 * same request Claude Code's `/usage` makes. No prompt and no model turn. Read-only: an expired
 * login is left for Claude Code to refresh. Resolves null when anything is missing or fails.
 */
export async function readClaudeLiveUsage(
  options: {
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    oauth?: ClaudeOAuth | null;
  } = {}
): Promise<{ windows: UsageWindow[]; observedAt: string } | null> {
  const now = options.now ?? (() => new Date());
  try {
    const oauth = options.oauth !== undefined ? options.oauth : await readClaudeOAuth(options.env ?? process.env);
    if (!oauth || typeof oauth.accessToken !== "string") return null;
    if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= now().getTime() + 30_000) return null;
    const response = await (options.fetchImpl ?? fetch)("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000)
    });
    if (!response.ok) return null;
    const windows = parseClaudeAccountUsage(await response.json());
    return windows.length ? { windows, observedAt: now().toISOString() } : null;
  } catch {
    return null;
  }
}

// The desk asks often while a debate runs; one live read serves every request inside this time.
const LIVE_CLAUDE_MAX_AGE_MS = 10_000;
let liveClaude: { at: number; read: ReturnType<typeof readClaudeLiveUsage> } | null = null;

function liveClaudeUsage(env: NodeJS.ProcessEnv, now: Date): ReturnType<typeof readClaudeLiveUsage> {
  if (!liveClaude || now.getTime() - liveClaude.at > LIVE_CLAUDE_MAX_AGE_MS) {
    const read = readClaudeLiveUsage({ env });
    liveClaude = { at: now.getTime(), read };
    // Keep the ledger current too, so a later offline read starts from this.
    void read.then((r) => {
      if (r)
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
  liveCodex = null;
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
    liveClaude?: boolean;
  } = {}
): Promise<Record<string, SeatUsage>> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const ledger = await readLedger(usageLedgerPath(env));
  const out: Record<string, SeatUsage> = {};

  for (const cliType of new Set(cliTypes)) {
    if (cliType === "claude") {
      const live = options.liveClaude ? await liveClaudeUsage(env, now) : null;
      if (live) {
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
          observedAt: ledger.claude.observedAt
        };
      } else {
        // Every window in the last reading has reset since: showing 0% would be a guess.
        out.claude = {
          kind: "unknown",
          source: "claude",
          reason: ledger.claude
            ? "The last reading is from before your limits reset. Shown again when Claude answers, or once Claude Code is signed in on this computer."
            : "Shown after the Claude seat's first answer, or once Claude Code is signed in on this computer."
        };
      }
    } else if (cliType === "codex") {
      const live = options.liveCodex ? await liveCodexLimits(options.liveCodex.command, env, now) : null;
      const codex = live ?? (await readCodexRateLimits(env));
      out.codex = codex
        ? {
            kind: "limits",
            source: "codex",
            windows: rollOver(codex.windows, now),
            observedAt: codex.observedAt,
            ...(live ? { live: true } : {})
          }
        : { kind: "unknown", source: "codex", reason: "No Codex session logs with rate limits found yet." };
    } else if (cliType === "antigravity") {
      const today = localDate(now);
      const day = ledger.antigravity?.date === today ? ledger.antigravity : null;
      out.antigravity = {
        kind: "tokens",
        source: "antigravity",
        date: today,
        totalTokens: day?.totalTokens ?? 0,
        calls: day?.calls ?? 0,
        observedAt: day?.observedAt ?? null
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
