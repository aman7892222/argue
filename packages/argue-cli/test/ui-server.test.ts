import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCliConfig } from "../src/config.js";
import { isLoopbackHost, listRuns, parseStartRequest, startUiServer, type UiServer } from "../src/ui/server.js";
import { renderUiPage } from "../src/ui/page.js";

const CONFIG = {
  schemaVersion: 1,
  providers: { mock: { type: "mock", models: { fake: {} } } },
  agents: [
    { id: "a1", provider: "mock", model: "fake" },
    { id: "a2", provider: "mock", model: "fake" }
  ]
};

async function makeWorkspace(): Promise<{ root: string; configPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "argue-ui-"));
  const configPath = join(root, "argue.config.json");
  await writeFile(configPath, JSON.stringify(CONFIG));
  return { root, configPath };
}

function call(
  server: UiServer,
  path: string,
  options: { method?: string; token?: string | null; host?: string; origin?: string; body?: unknown } = {}
): Promise<{ status: number; body: unknown; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const req = request(
      {
        host: "127.0.0.1",
        port: server.port,
        path,
        method: options.method ?? "GET",
        headers: {
          host: options.host ?? `127.0.0.1:${server.port}`,
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.token === null ? {} : { "x-argue-token": options.token ?? server.token }),
          ...(payload ? { "content-type": "application/json" } : {})
        }
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () => {
          let body: unknown = null;
          try {
            body = JSON.parse(text);
          } catch {
            // html page
          }
          resolve({ status: res.statusCode ?? 0, body, text });
        });
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

describe("ui server", () => {
  let server: UiServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("serves the page but guards the API with the token and a loopback Host", async () => {
    const { configPath } = await makeWorkspace();
    server = await startUiServer({ configPath });

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#t=[\w-]+$/);
    const page = await call(server, "/", { token: null });
    expect(page.status).toBe(200);
    expect(page.text).toContain("debate desk");

    expect((await call(server, "/api/config", { token: null })).status).toBe(401);
    expect((await call(server, "/api/config", { token: "wrong" })).status).toBe(401);
    expect((await call(server, "/api/config", { host: "evil.example:80" })).status).toBe(403);
    // A page on another site cannot drive the API, even with the right token.
    expect((await call(server, "/api/config", { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(server, "/api/config", { origin: `http://127.0.0.1:${server.port}` })).status).toBe(200);

    const config = await call(server, "/api/config");
    expect(config.status).toBe(200);
    expect(config.body).toMatchObject({
      agents: [{ id: "a1" }, { id: "a2" }],
      defaults: { agents: ["a1", "a2"], maxRounds: 3, threshold: 1 }
    });
  });

  it("lists finished and in-progress runs and returns events incrementally", async () => {
    const { root, configPath } = await makeWorkspace();
    const done = join(root, "out", "argue_1700000000000_aaaaaa");
    const live = join(root, "out", "argue_1700000000001_bbbbbb");
    await mkdir(done, { recursive: true });
    await mkdir(live, { recursive: true });
    await mkdir(join(root, "out", "not-a-run"), { recursive: true });

    const ev = (seq: number, type: string, payload: Record<string, unknown> = {}): string =>
      JSON.stringify({ v: 1, kind: "argue.event", seq, event: { type, payload } }) + "\n";
    await writeFile(join(done, "events.jsonl"), ev(0, "SessionStarted") + ev(1, "Finalized"));
    await writeFile(
      join(done, "result.json"),
      JSON.stringify({ status: "consensus", task: { prompt: "p", title: "Done run" }, metrics: { elapsedMs: 5 } })
    );
    // second line is half-written: it must be skipped, not crash the endpoint
    await writeFile(join(live, "events.jsonl"), ev(0, "SessionStarted", { participants: ["a1", "a2"] }) + '{"seq":1,');

    server = await startUiServer({ configPath });
    const runs = (await call(server, "/api/runs")).body as { runs: Array<Record<string, unknown>> };
    expect(runs.runs.map((r) => [r.requestId, r.status, r.title])).toEqual([
      ["argue_1700000000001_bbbbbb", "in_progress", null],
      ["argue_1700000000000_aaaaaa", "consensus", "Done run"]
    ]);

    const all = (await call(server, "/api/runs/argue_1700000000000_aaaaaa")).body as {
      events: unknown[];
      result: unknown;
    };
    expect(all.events).toHaveLength(2);
    expect(all.result).toMatchObject({ status: "consensus" });

    const since = (await call(server, "/api/runs/argue_1700000000000_aaaaaa?since=1")).body as { events: unknown[] };
    expect(since.events).toHaveLength(1);

    expect((await call(server, "/api/runs/..%2Fescape")).status).toBe(400);
  });

  it("reports usage per CLI kind with the agents that share it", async () => {
    const { root } = await makeWorkspace();
    const configPath = join(root, "cli.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        providers: {
          claude: { type: "cli", cliType: "claude", models: { opus: {} } },
          agy: { type: "cli", cliType: "antigravity", models: { m: {} } },
          mock: { type: "mock", models: { fake: {} } }
        },
        agents: [
          { id: "c1", provider: "claude", model: "opus" },
          { id: "c2", provider: "claude", model: "opus" },
          { id: "g", provider: "agy", model: "m" },
          { id: "x", provider: "mock", model: "fake" }
        ]
      })
    );

    server = await startUiServer({ configPath });
    const usage = (await call(server, "/api/usage")).body as {
      seats: Array<{ cliType: string; agents: string[]; usage: { kind: string } }>;
    };
    expect(usage.seats.map((s) => [s.cliType, s.agents, s.usage.kind])).toEqual([
      ["claude", ["c1", "c2"], expect.stringMatching(/^(limits|unknown)$/)],
      ["antigravity", ["g"], "tokens"]
    ]);
  });

  it("adds and removes CLI seats in the config, refusing invalid ones", async () => {
    const { configPath } = await makeWorkspace();
    server = await startUiServer({ configPath });

    const added = await call(server, "/api/seats", {
      method: "POST",
      body: { id: "mycli", cliType: "text", model: "m1", command: "mycli", args: ["--model", "{providerModel}"] }
    });
    expect(added.status).toBe(201);
    const afterAdd = JSON.parse(await readFile(configPath, "utf8")) as {
      providers: Record<string, unknown>;
      agents: Array<{ id: string }>;
    };
    expect(afterAdd.providers.mycli).toEqual({
      type: "cli",
      cliType: "text",
      command: "mycli",
      args: ["--model", "{providerModel}"],
      models: { m1: {} }
    });
    expect(afterAdd.agents.map((a) => a.id)).toEqual(["a1", "a2", "mycli"]);

    const config = (await call(server, "/api/config")).body as {
      agents: Array<{ id: string; cliType: string | null }>;
    };
    expect(config.agents.find((a) => a.id === "mycli")?.cliType).toBe("text");

    expect(
      (
        await call(server, "/api/seats", {
          method: "POST",
          body: { id: "mycli", cliType: "text", model: "x", command: "c" }
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call(server, "/api/seats", {
          method: "POST",
          body: { id: "bad name!", cliType: "claude", model: "opus" }
        })
      ).status
    ).toBe(400);
    expect(
      (await call(server, "/api/seats", { method: "POST", body: { id: "t", cliType: "text", model: "m" } })).body
    ).toEqual({
      error: "a custom CLI needs its command"
    });

    expect((await call(server, "/api/seats/mycli", { method: "DELETE" })).status).toBe(200);
    const afterRemove = JSON.parse(await readFile(configPath, "utf8")) as { providers: Record<string, unknown> };
    expect(afterRemove.providers.mycli).toBeUndefined();
    expect((await call(server, "/api/seats/nobody", { method: "DELETE" })).status).toBe(400);
  });

  it("saves the desk theme in the config and serves the page with it", async () => {
    const { configPath } = await makeWorkspace();
    server = await startUiServer({ configPath });

    expect((await call(server, "/", { token: null })).text).toContain('var pref = "system";');
    expect((await call(server, "/api/desk/theme", { method: "POST", body: { theme: "dark" } })).status).toBe(200);
    expect((JSON.parse(await readFile(configPath, "utf8")) as { desk?: unknown }).desk).toEqual({ theme: "dark" });
    expect((await call(server, "/", { token: null })).text).toContain('var pref = "dark";');

    expect((await call(server, "/api/desk/theme", { method: "POST", body: { theme: "neon" } })).status).toBe(400);
    expect(
      (await call(server, "/api/desk/theme", { method: "POST", token: null, body: { theme: "light" } })).status
    ).toBe(401);
  });

  it("remembers each seat's model and effort in the config, and forgets them with the seat", async () => {
    const { configPath } = await makeWorkspace();
    server = await startUiServer({ configPath });
    const desk = async (): Promise<unknown> =>
      (JSON.parse(await readFile(configPath, "utf8")) as { desk?: unknown }).desk;

    const pick = (body: unknown): Promise<{ status: number }> =>
      call(server!, "/api/desk/seat", { method: "POST", body });
    expect((await pick({ id: "a1", model: "fake-2", effort: "high" })).status).toBe(200);
    expect(((await call(server, "/api/config")).body as { picks: unknown }).picks).toEqual({
      a1: { model: "fake-2", effort: "high" }
    });
    expect((await pick({ id: "nobody", model: "x" })).status).toBe(400);
    expect((await pick({ id: "a1", effort: "HIGH; rm" })).status).toBe(400);
    expect((await pick({ id: "a1", model: "bad\nmodel" })).status).toBe(400);

    // Two quick saves both land: config writes are queued, never interleaved.
    await Promise.all([
      call(server, "/api/desk/theme", { method: "POST", body: { theme: "dark" } }),
      pick({ id: "a2", effort: "low" })
    ]);
    expect(await desk()).toEqual({
      theme: "dark",
      seats: { a1: { model: "fake-2", effort: "high" }, a2: { effort: "low" } }
    });

    // Back to the seat's own model and effort: its entry goes.
    await pick({ id: "a2", model: "", effort: "" });
    expect(await desk()).toEqual({ theme: "dark", seats: { a1: { model: "fake-2", effort: "high" } } });
    // Removing a seat drops what was picked for it.
    expect((await call(server, "/api/seats/a1", { method: "DELETE" })).status).toBe(200);
    expect(await desk()).toEqual({ theme: "dark" });
  });

  it("stops when the page asks it to quit, and after going idle", async () => {
    const { configPath } = await makeWorkspace();
    const quitting = await startUiServer({ configPath });
    expect((await call(quitting, "/api/shutdown", { method: "POST" })).status).toBe(200);
    await quitting.closed;

    const idle = await startUiServer({ configPath, idleExitMs: 1 });
    // The idle check runs every 5 s; closing must resolve `closed` without a request ever arriving.
    await Promise.race([
      idle.closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("idle server did not stop")), 8000))
    ]);
  }, 12_000);

  it("launches a run and reports it before any event exists", async () => {
    const { root, configPath } = await makeWorkspace();
    const fakeCli = join(root, "fake-cli.mjs");
    await writeFile(fakeCli, "setTimeout(() => {}, 50);\n");

    server = await startUiServer({ configPath, runCommand: { command: process.execPath, args: [fakeCli] } });

    const bad = await call(server, "/api/runs", { method: "POST", body: { task: "x", agents: ["a1"] } });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "pick at least two agents" });

    const started = await call(server, "/api/runs", {
      method: "POST",
      body: { task: "Debate this", agents: ["a1", "a2"], maxRounds: 1, threshold: 0.67 }
    });
    expect(started.status).toBe(201);
    const { requestId } = started.body as { requestId: string };

    const runs = (await call(server, "/api/runs")).body as { runs: Array<{ requestId: string; process: unknown }> };
    const mine = runs.runs.find((r) => r.requestId === requestId);
    expect(mine?.process).toMatchObject({ task: "Debate this" });
  });
});

describe("parseStartRequest", () => {
  it("validates task, agents, rounds and threshold", async () => {
    const { configPath } = await makeWorkspace();
    const loaded = await loadCliConfig({ explicitPath: configPath });

    expect(parseStartRequest({ task: " ", agents: ["a1", "a2"] }, loaded)).toEqual({
      ok: false,
      error: "task is required"
    });
    expect(parseStartRequest({ task: "t", agents: ["a1", "zz"] }, loaded)).toEqual({
      ok: false,
      error: "unknown agent(s): zz"
    });
    expect(parseStartRequest({ task: "t", agents: ["a1", "a1"] }, loaded)).toEqual({
      ok: false,
      error: "pick at least two agents"
    });
    expect(parseStartRequest({ task: "t", agents: ["a1", "a2"], maxRounds: 0 }, loaded).ok).toBe(false);
    expect(parseStartRequest({ task: "t", agents: ["a1", "a2"], threshold: 1.5 }, loaded).ok).toBe(false);
    expect(parseStartRequest({ task: " t ", agents: ["a1", "a2"] }, loaded)).toEqual({
      ok: true,
      value: { task: "t", agents: ["a1", "a2"], maxRounds: 3, threshold: 1, settings: {} }
    });
  });
});

describe("helpers", () => {
  it("accepts only loopback Host headers on the right port", () => {
    expect(isLoopbackHost("127.0.0.1:4517", 4517)).toBe(true);
    expect(isLoopbackHost("localhost:4517", 4517)).toBe(true);
    expect(isLoopbackHost("127.0.0.1:80", 4517)).toBe(false);
    expect(isLoopbackHost("attacker.test:4517", 4517)).toBe(false);
    expect(isLoopbackHost(undefined, 4517)).toBe(false);
  });

  it("returns no runs when the output folder does not exist", async () => {
    const { configPath } = await makeWorkspace();
    expect(await listRuns(await loadCliConfig({ explicitPath: configPath }))).toEqual([]);
  });

  it("never interpolates into the page and renders model text as text", () => {
    const page = renderUiPage();
    expect(page).toContain("<!doctype html>");
    expect(page).not.toContain("innerHTML");
    // Every inline script compiles (a stray backtick in page.ts would cut the page short).
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(1);
    for (const code of scripts) expect(() => new Function(code)).not.toThrow();
    // No unthemed browser widgets: lists and dialogs are the desk's own.
    expect(page).not.toMatch(/<select|<datalist|\b(alert|confirm|prompt)\(/);
  });
});
