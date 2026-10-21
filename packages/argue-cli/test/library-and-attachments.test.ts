import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_CLIS, parseLlmModels, parseOllamaList } from "../src/cli-catalog.js";
import { resolveAttachments } from "../src/index.js";
import { createCliRunner, debateAttachments } from "../src/runtime/cli.js";
import { debateFolderName, isInside, listLibrary, saveToLibrary } from "../src/ui/library.js";
import { citedMdToHtml, esc, mdToHtml, renderReportHtml, takeCitations } from "../src/ui/report.js";
import { parseAddSeatRequest } from "../src/ui/seats.js";
import { parseAttachments } from "../src/ui/server.js";
import { SEAT_THEMES, seatIconSvg, themeForSeat } from "../src/ui/themes.js";

const RESULT = {
  requestId: "argue_1792401491455_072ee9",
  status: "consensus",
  task: { prompt: "Pick a stack", title: "Weekend stack" },
  finalClaims: [{ claimId: "a:0:0", title: "Use Astro", statement: "<script>alert(1)</script>", proposedBy: ["a"] }],
  claimResolutions: [{ claimId: "a:0:0", status: "resolved", acceptCount: 2, rejectCount: 0, totalVoters: 2 }],
  representative: { participantId: "a" },
  scoreboard: [
    { participantId: "a", total: 80, breakdown: { correctness: 70 } },
    { participantId: "b", total: 75, breakdown: { correctness: 60 } }
  ],
  report: { finalSummary: "Ship it <b>now</b>", representativeSpeech: "### Plan\n- **Fri**: write\n- Sat: deploy" },
  rounds: [
    {
      round: 0,
      outputs: [
        {
          participantId: "a",
          phase: "initial",
          summary: "s",
          fullResponse: "x",
          extractedClaims: [{ title: "Use Astro", statement: "st" }]
        }
      ]
    }
  ]
};

describe("seat themes", () => {
  it("matches model family first, then CLI", () => {
    expect(themeForSeat("claude-opus-5-5-high", "antigravity")?.id).toBe("claude");
    expect(themeForSeat("gemini-4-argon-high", "antigravity")?.id).toBe("gemini");
    expect(themeForSeat("gpt-6-astra", "codex")?.id).toBe("chatgpt");
    expect(themeForSeat("llama3.3", "ollama")?.id).toBe("meta");
    expect(themeForSeat("devstral-medium", "vibe")?.id).toBe("mistral");
    expect(themeForSeat("qwen3-coder-plus", "qwen")?.id).toBe("qwen");
    expect(themeForSeat("deepseek-r1", "ollama")?.id).toBe("deepseek");
    expect(themeForSeat("unknown-model", "ollama")?.id).toBe("ollama");
    expect(themeForSeat("x", "nothing")).toBeNull();
  });

  it("exports a valid SVG for every theme", () => {
    expect(SEAT_THEMES.length).toBeGreaterThanOrEqual(19);
    for (const theme of SEAT_THEMES) {
      const svg = seatIconSvg(theme);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/<script/i);
    }
  });
});

describe("extra CLI presets", () => {
  it("parses ollama and llm model listings", () => {
    expect(
      parseOllamaList(
        "NAME              ID    SIZE   MODIFIED\nllama3.3:latest   abc   42 GB  2 days ago\nqwen3:8b  def  5 GB  1 day ago\n"
      )
    ).toEqual(["llama3.3", "qwen3:8b"]);
    expect(parseLlmModels("OpenAI Chat: gpt-4o (aliases: 4o)\nAnthropic Messages: claude-sonnet-4\n")).toEqual([
      "gpt-4o",
      "claude-sonnet-4"
    ]);
  });

  it("takes preset flags from the server catalog, never from the request", () => {
    const parsed = parseAddSeatRequest(
      { id: "llama", preset: "ollama", model: "llama3.3", args: ["--dangerous"], env: { X: "1" } },
      KNOWN_CLIS
    );
    expect(parsed).toMatchObject({ ok: true, value: { cliType: "text", args: ["run", "{providerModel}"] } });
    expect((parsed as { value: { env?: unknown } }).value.env).toBeUndefined();

    const kimi = parseAddSeatRequest({ id: "kimi", preset: "kimi", model: "kimi-k2" }, KNOWN_CLIS);
    expect(kimi).toMatchObject({ ok: true, value: { permissionMode: "auto" } }); // flagged: acts on its own
    expect(parseAddSeatRequest({ id: "x", preset: "nope", model: "m" }, KNOWN_CLIS).ok).toBe(false);
  });
});

describe("attachments", () => {
  it("keeps only safe basenames of allowed types, within limits", () => {
    const data = Buffer.from("hello").toString("base64");
    const ok = parseAttachments([
      { name: "..\\..\\Windows\\evil.pdf", data },
      { name: "photo (1).PNG", data },
      { name: "photo (1).png", data }
    ]);
    expect(ok).toMatchObject({ ok: true });
    expect((ok as { value: Array<{ name: string }> }).value.map((f) => f.name)).toEqual([
      "evil.pdf",
      "photo (1).PNG",
      "2-photo (1).png"
    ]);

    expect(parseAttachments([{ name: "run.exe", data }]).ok).toBe(false);
    expect(parseAttachments([{ name: ".bashrc", data }]).ok).toBe(false);
    expect(parseAttachments([{ name: "a.pdf", data: "" }]).ok).toBe(false);
    expect(parseAttachments(Array.from({ length: 11 }, (_, i) => ({ name: `${i}.png`, data }))).ok).toBe(false);
  });

  it("validates --attach paths and hands them to the runners", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-attach-"));
    const pdf = join(dir, "brief.pdf");
    const png = join(dir, "chart.png");
    await writeFile(pdf, "%PDF");
    await writeFile(png, "png");
    expect(await resolveAttachments([pdf, png])).toEqual([pdf, png]);
    await expect(resolveAttachments([join(dir, "missing.pdf")])).rejects.toThrow(/not a file/);
    expect(debateAttachments({ ARGUE_ATTACHMENTS: JSON.stringify([pdf, png]) })).toEqual([pdf, png]);
    expect(debateAttachments({ ARGUE_ATTACHMENTS: "garbage" })).toEqual([]);
  });

  it("gives Claude Read only (inside the attachments folder) and Codex the images", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-attach-run-"));
    const png = join(dir, "chart.png");
    await writeFile(png, "png");
    const script = join(dir, "echo.mjs");
    await writeFile(
      script,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ fullResponse: JSON.stringify({ argv: process.argv, cwd: process.cwd() }), summary: "ok", taskTitle: "t", extractedClaims: [], judgements: [] }));\n`,
      { mode: 0o755 }
    );
    const task = {
      kind: "round",
      sessionId: "s",
      requestId: "r",
      participantId: "a1",
      phase: "initial",
      round: 0,
      prompt: "p",
      claimCatalog: []
    } as const;
    const agent = { id: "a1", provider: "p", model: "m", providerModel: "m", modelConfig: {}, providerConfig: {} };

    const previous = process.env.ARGUE_ATTACHMENTS;
    process.env.ARGUE_ATTACHMENTS = JSON.stringify([png]);
    try {
      const claude = createCliRunner({ type: "cli", cliType: "claude", command: script, args: [], models: { m: {} } });
      const c = JSON.parse(
        ((await claude.runTask({ task, agent })) as { output: { fullResponse: string } }).output.fullResponse
      ) as {
        argv: string[];
        cwd: string;
      };
      expect(c.argv).toContain("--restricted");
      expect(c.argv[c.argv.indexOf("--tools") + 1]).toBe("Read");
      expect(c.cwd.toLowerCase()).toBe(dir.toLowerCase());

      const codex = createCliRunner({ type: "cli", cliType: "codex", command: script, args: [], models: { m: {} } });
      const x = JSON.parse(
        ((await codex.runTask({ task, agent })) as { output: { fullResponse: string } }).output.fullResponse
      ) as {
        argv: string[];
      };
      expect(x.argv[x.argv.indexOf("-i") + 1]).toBe(png);
    } finally {
      if (previous === undefined) delete process.env.ARGUE_ATTACHMENTS;
      else process.env.ARGUE_ATTACHMENTS = previous;
    }
  });
});

describe("library", () => {
  it("escapes all debate text and renders light markdown safely", () => {
    const html = renderReportHtml(RESULT, {
      reasoning: true,
      seats: [{ id: "a", model: "claude-opus", cli: "claude" }]
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Ship it &lt;b&gt;now&lt;/b&gt;");
    expect(html).toContain("<h3>Plan</h3>");
    expect(html).toContain("<li><b>Fri</b>: write</li>");
    expect(mdToHtml("**<img src=x onerror=alert(1)>**")).toBe("<p><b>&lt;img src=x onerror=alert(1)&gt;</b></p>");
    expect(esc(`"'&`)).toBe("&quot;&#39;&amp;");
  });

  it("marks each passage of the report with the seats whose claims it cites", () => {
    const isClaim = (id: string): boolean => /^(gemini|claude):/.test(id);
    expect(takeCitations("**Stack (`gemini:0:0`, merged `claude:0:2` & `claude:1:0`):** use Astro", isClaim)).toEqual({
      text: "**Stack:** use Astro",
      ids: ["gemini:0:0", "claude:0:2", "claude:1:0"]
    });
    // Brackets with other words, or ids of seats not in the debate, stay as written.
    expect(takeCitations("Deploy early (see `gemini:0:1` for DNS)", isClaim).ids).toEqual([]);
    expect(takeCitations("at (`other:0:1`)", isClaim).text).toBe("at (`other:0:1`)");

    const cite = {
      seatOf: (id: string) => (isClaim(id) ? id.split(":")[0]! : null),
      mark: (seat: string) => `<i data-seat="${seat}"></i>`,
      label: (id: string) => `${id} <title>`
    };
    const html = citedMdToHtml("### Plan\n- Cut scope (`gemini:0:2`, `claude:0:1`)\nAs `claude:0:1` said", cite)!;
    expect(html).toContain(
      '<div class="src" title="gemini:0:2 &lt;title&gt;\nclaude:0:1 &lt;title&gt;"><i data-seat="gemini"></i><i data-seat="claude"></i></div>'
    );
    expect(html).toContain('data-bullet="•">Cut scope</div>');
    expect(html).toContain(
      'As <span class="cite" title="claude:0:1 &lt;title&gt;"><i data-seat="claude"></i></span> said'
    );
    expect(citedMdToHtml("No citations here, and `code` stays code.", cite)).toBeNull();
  });

  it("makes safe folder names and never writes outside the library", () => {
    expect(debateFolderName('a/b\\c:d*e?"<>|. ', new Date(2026, 9, 19, 14, 48))).toBe("2026-10-19 14.48 a b c d e");
    expect(debateFolderName("", new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02 03.04 debate");
    expect(isInside("/lib", "/lib/x")).toBe(true);
    expect(isInside("/lib", "/lib/../etc")).toBe(false);
    expect(isInside("/lib", "/lib")).toBe(false);
  });

  it("saves report.html + debate.json (PDF skipped without a browser), reuses the folder, and lists it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argue-library-"));
    const first = await saveToLibrary({ dir, result: RESULT, seats: [], attachments: ["brief.pdf"], browser: null });
    const again = await saveToLibrary({ dir, result: RESULT, seats: [], attachments: ["brief.pdf"], browser: null });
    expect(again.folder).toBe(first.folder);
    expect(first.pdf).toBe(false);

    const saved = JSON.parse(await readFile(join(first.folder, "debate.json"), "utf8")) as {
      version: number;
      attachments: string[];
    };
    expect(saved).toMatchObject({ version: 1, attachments: ["brief.pdf"] });
    expect(await readFile(join(first.folder, "report.html"), "utf8")).toContain("Weekend stack");

    const entries = await listLibrary(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: RESULT.requestId,
      title: "Weekend stack",
      status: "consensus",
      hasPdf: false
    });

    await expect(
      saveToLibrary({ dir, result: { requestId: "../../x" }, seats: [], attachments: [], browser: null })
    ).rejects.toThrow();
  });
});
