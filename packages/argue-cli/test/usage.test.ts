import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeDrop } from "../src/drop-reason.js";
import { CliExitError, explainCliFailure, parseClaudeStream } from "../src/runtime/cli.js";
import {
  parseClaudeRateLimit,
  readCodexLiveRateLimits,
  readCodexRateLimits,
  readSeatUsage,
  recordAntigravityTokens,
  recordClaudeRateLimit
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
