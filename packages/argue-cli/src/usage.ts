import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Subscription usage for each seat, as far as each CLI reveals it:
 * - claude: every `--output-format stream-json` call reports a `rate_limit_event` with
 *   5-hour / 7-day utilization; argue records the latest one in a small ledger file.
 * - codex: Codex writes `rate_limits` (5-hour / weekly used_percent) into its own session
 *   logs under ~/.codex/sessions, so they are read directly and are always current.
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
  | { kind: "limits"; source: "claude" | "codex"; windows: UsageWindow[]; observedAt: string | null }
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
  options: { env?: NodeJS.ProcessEnv; now?: Date } = {}
): Promise<Record<string, SeatUsage>> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const ledger = await readLedger(usageLedgerPath(env));
  const out: Record<string, SeatUsage> = {};

  for (const cliType of new Set(cliTypes)) {
    if (cliType === "claude") {
      out.claude = ledger.claude
        ? {
            kind: "limits",
            source: "claude",
            windows: rollOver(ledger.claude.windows, now),
            observedAt: ledger.claude.observedAt
          }
        : { kind: "unknown", source: "claude", reason: "Shown after the Claude seat's first call in a debate." };
    } else if (cliType === "codex") {
      const codex = await readCodexRateLimits(env);
      out.codex = codex
        ? { kind: "limits", source: "codex", windows: rollOver(codex.windows, now), observedAt: codex.observedAt }
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
