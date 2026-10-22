import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeDrop } from "../src/drop-reason.js";
import { CliExitError, explainCliFailure, parseClaudeStream } from "../src/runtime/cli.js";
import {
  parseClaudeAccountUsage,
  parseClaudeRateLimit,
  readClaudeLiveUsage,
  readCodexLiveRateLimits,
  readCodexRateLimits,
  readSeatUsage,
  recordAntigravityTokens,
  recordClaudeRateLimit,
  resetLiveUsageCache
} from "../src/usage.js";

const CLAUDE_INFO = {
  status: "allowed",
  unifiedWindows: {
    five_hour: { utilization: 0.02, resetsAt: 1792419600 },
    seven_day: { utilization: 0.41, resetsAt: 1792609200 }
  }
};

describe("parseClaudeStream", () => {
  it("takes the answer from the result event and the latest rate limits", () => {
    const stdout = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "rate_limit_event", rate_limit_info: CLAUDE_INFO }),
      "not json",
      JSON.stringify({ type: "result", subtype: "success", is_error: false, result: '{"summary":"ok"}' })
    ].join("\n");

    expect(parseClaudeStream(stdout)).toEqual({ response: '{"summary":"ok"}', rateLimit: CLAUDE_INFO });
  });

  it("falls back to raw stdout when the output is not stream-json", () => {
    expect(parseClaudeStream('{"fullResponse":"x"}')).toEqual({ response: '{"fullResponse":"x"}', rateLimit: null });
  });

  it("throws on an error result", () => {
    const stdout = JSON.stringify({ type: "result", is_error: true, result: "usage limit reached" });
    expect(() => parseClaudeStream(stdout)).toThrow(/usage limit reached/);
  });
});

describe("usage ledger", () => {
  it("converts Claude utilization to percent windows", () => {
    expect(parseClaudeRateLimit(CLAUDE_INFO)).toEqual([
      { label: "5-hour", usedPercent: 2, resetsAt: 1792419600 },
      { label: "7-day", usedPercent: 41, resetsAt: 1792609200 }
    ]);
    expect(parseClaudeRateLimit(null)).toEqual([]);
  });

  it("records Claude limits and per-day agy tokens, and rolls over expired windows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-usage-"));
    const file = join(dir, "usage.json");
    const env = { ARGUE_USAGE_FILE: file, CODEX_HOME: join(dir, "no-codex") };
    const now = new Date(1792400000 * 1000);

    await recordClaudeRateLimit(CLAUDE_INFO, now, file);
    await recordAntigravityTokens(1000, now, file);
    await recordAntigravityTokens(500, now, file);
    await recordAntigravityTokens(0, now, file); // ignored

    const usage = await readSeatUsage(["claude", "antigravity", "codex", "text"], { env, now });
    expect(usage.claude).toMatchObject({ kind: "limits", windows: [{ usedPercent: 2 }, { usedPercent: 41 }] });
    expect(usage.antigravity).toMatchObject({ kind: "tokens", totalTokens: 1500, calls: 2 });
    expect(usage.codex).toMatchObject({ kind: "unknown" });
    expect(usage.text).toBeUndefined();

    // after the 5-hour reset, that window reads 0%; the next local day starts a fresh token count
    const later = new Date(1792419600 * 1000 + 24 * 3600 * 1000);
    const afterReset = await readSeatUsage(["claude", "antigravity"], { env, now: later });
    expect(afterReset.claude).toMatchObject({ windows: [{ usedPercent: 0, resetsAt: null }, { usedPercent: 41 }] });
    expect(afterReset.antigravity).toMatchObject({ totalTokens: 0, calls: 0 });

    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ version: 1 });
  });

  it("reads the newest rate_limits snapshot from Codex session logs", async () => {
    const home = await mkdtemp(join(tmpdir(), "argue-codex-"));
    const day = join(home, "sessions", "2026", "10", "19");
    await mkdir(day, { recursive: true });
    const snapshot = (used: number) =>
      JSON.stringify({
        timestamp: "2026-10-19T09:00:00Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            primary: { used_percent: used, window_minutes: 300, resets_at: 1792413254 },
            secondary: { used_percent: 2, window_minutes: 10080, resets_at: 1793000054 }
          }
        }
      });
    await writeFile(join(day, "rollout-a.jsonl"), snapshot(10) + "\n");
    await writeFile(join(day, "rollout-b.jsonl"), '{"type":"session_meta"}\n' + snapshot(16) + "\n");

    expect(await readCodexRateLimits({ CODEX_HOME: home })).toEqual({
      windows: [
        { label: "5-hour", usedPercent: 16, resetsAt: 1792413254 },
        { label: "weekly", usedPercent: 2, resetsAt: 1793000054 }
      ],
      observedAt: "2026-10-19T09:00:00Z"
    });
    expect(await readCodexRateLimits({ CODEX_HOME: join(home, "missing") })).toBeNull();
  });
});

describe("plan limits", () => {
  // What Claude printed when it refused the final vote of a real debate (trimmed).
  const claudeRefused = [
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "rejected",
        rateLimitType: "five_hour",
        unifiedWindows: {
          five_hour: { utilization: 1, resetsAt: 1792588200 },
          seven_day: { utilization: 0.8, resetsAt: 1792609200 }
        }
      }
    }),
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      api_error_status: 429,
      result: "You've hit your session limit · resets 6:40pm (Asia/Kolkata)"
    })
  ].join("\n");

  it("reads Claude's refusal as a plan limit and marks its 5-hour window full", async () => {
    const error = await explainCliFailure("claude", new CliExitError(1, null, claudeRefused, ""));
    expect(error.message).toBe("plan_limit: You've hit your session limit · resets 6:40pm (Asia/Kolkata)");
    const usage = await readSeatUsage(["claude"], { now: new Date(1792580000 * 1000) });
    expect(usage.claude).toMatchObject({
      kind: "limits",
      windows: [
        { label: "5-hour", usedPercent: 100 },
        { label: "7-day", usedPercent: 80 }
      ]
    });
  });

  it("reads limit wording only from a CLI's error output, never from its answer", async () => {
    const codex = await explainCliFailure(
      "codex",
      new CliExitError(
        1,
        null,
        "",
        "ERROR: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 8:04 PM.\n"
      )
    );
    expect(codex.message).toBe("plan_limit: You’ve hit your usage limit. Upgrade to Pro or try again at 8:04 PM.");

    const crashed = new CliExitError(2, null, '{"summary":"Add a rate limit to the API"}', "panic: something else");
    expect(await explainCliFailure("text", crashed)).toBe(crashed);
    expect(describeDrop("error", codex.message)).toBe(
      "plan limit reached (You’ve hit your usage limit. Upgrade to Pro or try again at 8:04 PM.)"
    );
    expect(describeDrop("timeout")).toBe("did not answer in time");
  });

  it("asks Codex's app server for its live limits without a prompt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-codex-live-"));
    const fake = join(dir, "fake-codex.mjs");
    await writeFile(
      fake,
      [
        "#!/usr/bin/env node",
        'import { createInterface } from "node:readline";',
        'createInterface({ input: process.stdin }).on("line", (line) => {',
        "  const msg = JSON.parse(line);",
        '  if (msg.method === "thread/start" || msg.method === "turn/start") process.exit(3);',
        "  if (msg.id === 1) console.log(JSON.stringify({ id: 1, result: {} }));",
        "  if (msg.id === 2) console.log(JSON.stringify({ id: 2, result: { rateLimits: {",
        "    primary: { usedPercent: 81, windowDurationMins: 300, resetsAt: 1792593243 },",
        "    secondary: { usedPercent: 13, windowDurationMins: 10080, resetsAt: 1793180043 } } } }));",
        "});"
      ].join("\n"),
      { mode: 0o755 }
    );
    const live = await readCodexLiveRateLimits({
      command: fake,
      env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}` },
      now: () => new Date("2026-10-21T13:00:00Z")
    });
    expect(live).toEqual({
      windows: [
        { label: "5-hour", usedPercent: 81, resetsAt: 1792593243 },
        { label: "weekly", usedPercent: 13, resetsAt: 1793180043 }
      ],
      observedAt: "2026-10-21T13:00:00.000Z"
    });
    expect(await readCodexLiveRateLimits({ command: join(dir, "missing-codex"), timeoutMs: 3000 })).toBeNull();
  });
});

describe("Claude live usage (account)", () => {
  const BODY = {
    five_hour: { utilization: 24, resets_at: "2026-10-22T11:20:00.000Z" },
    seven_day: { utilization: 4, resets_at: "2026-10-23T16:00:00+00:00" },
    seven_day_opus: null
  };
  const okFetch = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    resetLiveUsageCache();
  });

  it("parses percent utilization and ISO reset times", () => {
    expect(parseClaudeAccountUsage(BODY)).toEqual([
      { label: "5-hour", usedPercent: 24, resetsAt: Date.parse("2026-10-22T11:20:00Z") / 1000 },
      { label: "7-day", usedPercent: 4, resetsAt: Date.parse("2026-10-23T16:00:00Z") / 1000 }
    ]);
    expect(parseClaudeAccountUsage(null)).toEqual([]);
    expect(parseClaudeAccountUsage({ five_hour: { utilization: null } })).toEqual([]);
  });

  it("asks the account with Claude Code's saved login", async () => {
    const fetchImpl = okFetch(BODY);
    const now = () => new Date("2026-10-22T08:00:00Z");
    const result = await readClaudeLiveUsage({
      oauth: { accessToken: "tok", expiresAt: Date.parse("2026-10-22T09:00:00Z") },
      fetchImpl,
      now
    });
    expect(result?.windows.map((w) => w.usedPercent)).toEqual([24, 4]);
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/api/oauth/usage");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("does not use an expired login, a failed request, or a missing login", async () => {
    const now = () => new Date("2026-10-22T08:00:00Z");
    const fetchImpl = okFetch(BODY);
    expect(
      await readClaudeLiveUsage({
        oauth: { accessToken: "t", expiresAt: Date.parse("2026-10-22T07:59:00Z") },
        fetchImpl,
        now
      })
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    const failing = vi.fn(async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    expect(await readClaudeLiveUsage({ oauth: { accessToken: "t" }, fetchImpl: failing, now })).toBeNull();
    expect(await readClaudeLiveUsage({ oauth: null, fetchImpl, now })).toBeNull();
  });

  it("reads ~/.claude/.credentials.json for the desk and marks the result live", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-claude-live-"));
    await writeFile(
      join(dir, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "tok", expiresAt: Date.now() + 3_600_000 } })
    );
    vi.stubGlobal("fetch", okFetch(BODY));
    const env = { CLAUDE_CONFIG_DIR: dir, ARGUE_USAGE_FILE: join(dir, "usage.json") };
    const usage = await readSeatUsage(["claude"], { env, liveClaude: true });
    expect(usage.claude).toMatchObject({ kind: "limits", source: "claude", live: true });
    expect(usage.claude?.kind === "limits" && usage.claude.windows[0]!.usedPercent).toBe(24);
  });

  it("shows unknown rather than 0% when every window of the last reading has reset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-claude-stale-"));
    const file = join(dir, "usage.json");
    await recordClaudeRateLimit(CLAUDE_INFO, new Date(1792400000 * 1000), file);
    const env = { ARGUE_USAGE_FILE: file, CLAUDE_CONFIG_DIR: join(dir, "none") };
    const usage = await readSeatUsage(["claude"], { env, now: new Date(1792700000 * 1000), liveClaude: true });
    expect(usage.claude).toMatchObject({ kind: "unknown", source: "claude" });
  });
});
