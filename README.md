# argue

**[中文](README_CN.md) | [日本語](README_JP.md)**

> _Follow the argument wherever it leads._ — Socrates, in Plato's _Republic_

argue is a structured multi-agent debate engine. Multiple AI agents analyze the same problem independently, challenge each other's claims across rounds, and converge on consensus through voting — producing higher quality results than any single agent alone.

Give it a question. Get back claims that survived cross-examination, votes that quantify agreement, and a representative report backed by peer-reviewed scoring. Less hallucination, more rigor.

## This fork: the debate desk

This fork adds a **debate desk**, a local web page where Claude, ChatGPT, Gemini and other AI command-line tools (CLIs) debate a question. You can watch every round, read each AI's reasoning, and keep every result as a PDF. Everything runs on your own computer, with your own logins.

<p>
<img src="packages/argue-cli/assets/seat-icons/claude.svg" width="40" alt="Claude">
<img src="packages/argue-cli/assets/seat-icons/chatgpt.svg" width="40" alt="ChatGPT">
<img src="packages/argue-cli/assets/seat-icons/gemini.svg" width="40" alt="Gemini">
<img src="packages/argue-cli/assets/seat-icons/meta.svg" width="40" alt="Meta Llama">
<img src="packages/argue-cli/assets/seat-icons/mistral.svg" width="40" alt="Mistral">
<img src="packages/argue-cli/assets/seat-icons/qwen.svg" width="40" alt="Qwen">
<img src="packages/argue-cli/assets/seat-icons/deepseek.svg" width="40" alt="DeepSeek">
<img src="packages/argue-cli/assets/seat-icons/grok.svg" width="40" alt="Grok">
<img src="packages/argue-cli/assets/seat-icons/kimi.svg" width="40" alt="Kimi">
<img src="packages/argue-cli/assets/seat-icons/ollama.svg" width="40" alt="Ollama">
</p>

### Install it (first time with GitHub? start here)

You only do this once. It takes about 10 minutes.

1. **Install Node.js** (version 22 or newer). Download the "LTS" version from [nodejs.org](https://nodejs.org) and run the installer. On Windows you can instead open **PowerShell** and run:
   ```bash
   winget install OpenJS.NodeJS.LTS
   ```
2. **Install Git**, the tool that downloads code from GitHub: [git-scm.com/downloads](https://git-scm.com/downloads). On Windows you can run `winget install Git.Git` instead. Close and reopen PowerShell (on a Mac, Terminal) afterwards.
3. **Download this project and build it.** Paste these lines one at a time:
   ```bash
   git clone https://github.com/aman7892222/argue.git
   cd argue
   npm install
   npm run build
   ```
4. **Install at least one AI CLI and sign in to it.** The desk uses your own subscriptions. Any of these works:
   - Claude Code: `irm https://claude.ai/install.ps1 | iex` on Windows, or `curl -fsSL https://claude.ai/install.sh | bash` on Mac/Linux. Then run `claude auth login` once and choose **Claude account with subscription**. The Claude Code CLI has its **own** credentials — signing in to the Claude Desktop app does not sign in the CLI, so this step is still needed if the desktop app is already installed.
     - **"claude is not recognized" on Windows?** The installer puts it in `%USERPROFILE%\.local\bin`, which may not be on your PATH yet. Open a new PowerShell window, or run it by its full path: `& "$env:USERPROFILE\.local\bin\claude.exe" auth login`. The desk finds it there either way.
     - **"Your organization has disabled Claude subscription access for Claude Code"?** The CLI is signed in to a different account than the one with your plan. Run `claude auth logout`, then `claude auth login` with the right account.
   - ChatGPT (Codex): `npm install -g @openai/codex`, then `codex login`.
   - Gemini (Antigravity): `winget install Google.AntigravityCLI` (Mac/Linux: see antigravity.google), then run `agy` once to sign in.
   - Local models, free and offline: [Ollama](https://ollama.com/download), then `ollama pull llama3.3`.
5. **Open the desk.** Make a folder for your debates, go into it, and start the desk. It opens in your browser:
   ```bash
   mkdir my-debates
   cd my-debates
   node ../argue/packages/argue-cli/dist/cli.js ui --exit-when-idle 3
   ```
   (Adjust `../argue` if you cloned the project somewhere else.) Optionally, run `npm link -w packages/argue-cli` once inside the `argue` folder, and from then on just type `argue ui` in any folder.
6. **In the page:** click **Scan for CLIs** and then **Add** next to each AI it finds. Type a question, optionally attach PDFs or images, and press **Start debate**.
   - **Debate rounds** is how many rounds of cross-examination the seats get, at most (fewer if they agree early). An opening round, where each seat answers on its own, and a final vote are always added, so "Debate rounds 1" shows three steps: Opening proposals, Debate round 1, Final vote.

**To update later:** go into the `argue` folder and run `git pull`, then `npm install`, then `npm run build`.

### Where your debates are saved

Each finished debate gets its own folder (by default `debates/` next to your `argue.config.json`; use **Change folder…** in the page to pick another):

| File          | What it's for                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `report.pdf`  | The final answer: verdict, full report, claims and scores. Easy to read or share.                                              |
| `report.html` | The same, plus every round's reasoning (folded). It opens in any browser, works offline, and has a Print / Save as PDF button. |
| `debate.json` | Everything needed to reopen the debate in the desk or run it again.                                                            |

The PDF is made with Edge or Chrome, whichever your computer has. Without either, use `report.html` and its Print button. Debates, settings, logins and usage numbers stay on **your** computer and are never uploaded.

### Plan usage

The rings at the bottom of the sidebar show how much of each subscription is used. The big number is the shortest limit (usually the 5-hour session); the line under it is the week. Hover a ring for every limit and when it resets. They refresh every minute, and every 15 seconds while a debate runs.

| Seat                 | Where the numbers come from                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude               | Your Claude account, using the login Claude Code saved (the same check as Claude Code's `/usage`; no message sent, no usage spent). If that login has expired, the ring says so and offers **Check now**, which sends Claude one tiny Haiku message so Claude Code renews its login and reports usage. |
| ChatGPT (Codex)      | Your OpenAI account, through `codex app-server` (no message sent).                                                                                                                                                                                                                                     |
| Gemini (Antigravity) | `agy -p "/usage"`, showing only the limits that apply to the seat's model. If agy can't be read, the ring shows the tokens argue itself used today.                                                                                                                                                    |

A ring shows "—" with the reason when a number can't be read, rather than guessing. Usage numbers stay on your computer.

### Seats: any AI CLI

**Scan for CLIs** finds Claude Code, Codex, Antigravity, Gemini CLI, Copilot, opencode, Ollama, llm, Qwen Code, Aider, Cursor Agent, Goose, Kimi and Mistral Vibe, plus pi, droid and Amp. **Other CLI** seats anything else. Each seat gets its own model and effort picker for every debate. The seat icons (above, and in `packages/argue-cli/assets/seat-icons/`) are free to reuse.

## Live Demo

[![A sample argue report rendered in the hosted viewer](docs/assets/argue-report-sample.jpeg)](https://argue.onev.cat/example)

**[https://argue.onev.cat/example](https://argue.onev.cat/example)** — a real argue run rendered in the hosted viewer. Open it to see exactly what argue produces:

- **Agents arguing in the open.** Every claim, peer judgement, merge, and vote, round by round.
- **A polished dossier.** Composed by the highest-scoring agent — ready to read, share, or attach to a PR.
- **Complete raw data on disk.** The same JSON that powers the viewer is saved locally, ready to feed any downstream step (review bot, code generation, audit log, …).

## Install the Argue Skill

Already working with an agentic coding assistant (Claude Code, Codex, etc.)? Hand the setup over. Argue ships as an [agent skill](https://skills.sh/) that teaches your agent when to use argue, how to install and configure the CLI, which defaults to recommend, and how to run debates end-to-end.

```bash
npx skills add https://github.com/onevcat/argue --skill argue
```

Once installed, just ask your agent to "argue about X" or "get a second opinion on Y". It will bootstrap the CLI on first run (asking you before any global install) and drive the debate, the report, and any follow-up action for you.

## Quick Start

Prefer driving the CLI yourself like a cave-dweller with a stone axe? Suit yourself — here's the manual route.

### Install

```bash
npm install -g @onevcat/argue-cli
```

### Configure

```bash
# Create config file (~/.config/argue/config.json)
argue config init

# Add providers and agents
argue config add-provider --id claude --type cli --cli-type claude --model-id sonnet --agent claude-agent
argue config add-provider --id codex --type cli --cli-type codex --model-id gpt-5.3-codex --agent codex-agent
```

#### Use any agent CLI

`argue models` scans your PATH for known agent CLIs, lists each one's models where the CLI can report them, and prints a ready-to-paste `add-provider` line for each:

```bash
argue models          # human-readable
argue models --json   # for scripts and skills
```

Built-in cliTypes: `claude`, `codex`, `antigravity` (Google's `agy`; Gemini via an AI Pro login), `gemini`, `copilot`, `opencode`, `pi`, `droid`, `amp`. For **any other** agent CLI, use `text`. argue adds no flags of its own: it sends the prompt as plain text on stdin, or puts it in an arg that contains `{prompt}`, and parses the text that comes back:

```bash
argue config add-provider --id mycli --type cli --cli-type text --command mycli \
  --args "--print,--model,{providerModel}" --model-id my-model --agent mycli
```

On Windows, npm-installed CLIs (`.cmd` shims) are launched directly; no extra setup is needed.

### Debate desk (web UI)

```bash
argue ui
```

This opens a local page in your browser. From there you can start a debate (task, seats, rounds, consensus threshold) and watch it round by round as each agent answers. For every seat you see the claims it proposed, its stance on each peer claim (agree, disagree or revise) with its confidence, rationale and proposed rewording, plus merges, final votes with reasons, the verdict, claim tallies and peer scores. Debates started from the terminal or from another session show up too, live.

Results come first: the verdict, the claims with their tallies, and the peer scores. Below them, each round is folded into one line that shows which seats have answered and the stance totals; click it to see every seat's answer, claims, judgements and reasoning.

**Usage rings** at the top of the sidebar show how much of each plan's limit is used, the way Claude Code shows its ring. Hover a ring to see each window and when it resets.

| Seat        | Ring shows                                                | Where it comes from                                                                                                 |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Claude      | % of the 5-hour window used (hover for the 7-day window)  | the `rate_limit_event` that Claude Code reports on each call; argue saves the latest one to `~/.argue/usage.json`   |
| Codex       | % of the 5-hour window used (hover for the weekly window) | the `rate_limits` that Codex writes to its own logs in `~/.codex/sessions`                                          |
| Antigravity | tokens argue used today                                   | agy reports token counts but not its remaining quota. Its quota is also separate from the Gemini app's daily limit. |

These limits are shared with your other use of each plan. The Claude ring updates whenever a debate calls Claude, and the Codex ring whenever Codex runs anywhere.

**First run.** On a fresh machine, `argue ui` creates an empty `argue.config.json` in the current folder. Click **Scan for CLIs** and every agent CLI installed on the computer shows up, ready to add in one click.

**Pick the model and effort for each debate.** Every seat has its own model and effort picker, filled from what that CLI offers on your plan:

- Antigravity: every model `agy models` lists. The effort is part of the name, for example `gemini-4-argon-low`, `-medium` and `-high`.
- Codex: its model catalog, with each model's own effort levels.
- Claude Code: `opus`, `sonnet`, `haiku` and `fable` (which can bill extra credits on some plans), with `low` to `max` effort.

Your picks only apply to that debate (they're passed as `argue run --model-for <seat>=<model> --effort-for <seat>=<level>`), so your config never changes, and the page remembers them next time.

**Seats from the page.** Use **+ Connect another CLI** to see which agent CLIs are installed and what models each offers. Listing models asks each CLI for its catalog; it sends no prompts and uses no tokens. Pick a CLI and a model, or choose **Other CLI** to seat any command that reads a prompt and prints an answer. To remove a seat, hover it and click **×**.

**Nothing keeps running.** Click **Quit** on the page (or press Ctrl+C) to stop the desk and any debate it started. With `argue ui --exit-when-idle [minutes]` (default 3), the desk also stops by itself that long after its page is closed.

The page is served only on `127.0.0.1`, and its API requires a token that is created fresh each time the UI starts and is included in the printed link. Use `--port <n>` for a fixed port and `--no-open` to print the link instead of opening a browser. The UI shows each agent's final answer and stated reasoning, not its hidden chain of thought: agent CLIs do not expose that.

### Security & privacy

- **No accounts in this repo.** argue never stores logins. Each agent CLI uses its own sign-in on your machine (`~/.claude`, `~/.codex`, the OS keyring for agy), so anyone who clones this repo uses _their_ subscriptions, never yours.
- **Agents can't act by default.** CLI seats run with `permissionMode: "safe"`: no auto-approval for any CLI, Codex in a read-only sandbox, Gemini CLI in read-only `plan` mode, and Claude in restricted mode with no tools, no MCP servers and no skills (`--restricted --tools "" --strict-mcp-config --disable-slash-commands`). A hostile debate topic, or a peer's output, can't make a seat run commands or edit files. Set `"permissionMode": "auto"` on a provider (or pass `--permission-mode auto` to `config add-provider`) only when an agent has to act, for example with `--action`.
- **Attachments are read, not run.** Claude only gets a `Read` tool, inside the attachments folder (`--restricted`), Codex gets images via `-i`, and the rest see file paths. One caveat: Codex's read-only sandbox can still _read_ other files on the computer, so a hostile PDF could make it quote one of your files into the debate. That text goes only to your own AI accounts and your local report, but don't attach files you don't trust to a Codex seat.
- **The debate desk is local-only.** It listens on `127.0.0.1`, needs a fresh random token on every launch, compares that token in constant time, and rejects requests whose `Host` or `Origin` isn't its own page. That blocks other websites and DNS-rebinding tricks. Model output is always rendered as text, and a strict Content-Security-Policy blocks outside scripts. **Quit** and `--exit-when-idle` leave nothing running.
- **Local files stay local.** `argue.config.json`, `out/` and `.argue/` are git-ignored. Usage data lives in `~/.argue/usage.json`.
- **`argue view` is optional and third-party.** It opens results in the hosted viewer at `argue.onev.cat` by putting the report in the URL fragment. The debate desk doesn't use it. Skip `argue view` if you'd rather nothing leave your machine.

### Run a Debate

```bash
argue run --task "Should we use a monorepo or polyrepo for our microservices?"
```

Add `--verbose` to see each agent's reasoning, claims, and judgements in real time.

Need an agent to **act** on the result? Add `--action`:

```bash
argue run \
  --task "Review the issue: https://github.com/onevcat/argue/issues/22" \
  --action "Fix the issue based on consensus and open a PR" \
  --verbose
```

### What Happens

```
[argue] run started
  task: 研究这个 issue 的解法：https://github.com/onevcat/argue/issues/22
  agents: claude-agent, codex-agent | rounds: 2..3

[argue] initial#0  codex-agent (claims+6) — ESLint+Prettier setup, CI lint gate
[argue] initial#0  claude-agent (claims+6) — runtime bugs (couldn't access the issue URL)

[argue] debate#1   codex-agent (1✗ 5↻) — claude's claims valid but out-of-scope
[argue] debate#1   claude-agent (5✗ 1↻) — agreed, self-corrected
[argue] debate#1   claim merged c6 -> c2
  ... 2 more rounds, agents refine and converge ...

[argue] final_vote  11/11 claims accepted unanimously
[argue] result: consensus — codex-agent representative (83.70)
[argue] action: codex-agent opened PR #28
```

codex-agent accessed the issue and proposed ESLint/Prettier claims. claude-agent couldn't reach the URL and found runtime bugs instead. Through debate, codex-agent flagged them as out-of-scope, claude-agent self-corrected, and both converged. All 11 claims passed unanimously. The representative turned consensus into [a real PR](https://github.com/onevcat/argue/pull/28).

After each run, argue writes three output files to `~/.argue/output/<requestId>/` (global config) or `./out/<requestId>/` (local config):

| File           | Contents                                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| `events.jsonl` | Streaming event log — every dispatch, response, merge, vote, and score          |
| `result.json`  | Structured result — status, claims, resolutions, scores, representative, action |
| `summary.md`   | Human-readable report from the representative agent                             |

[See the full unabridged output of this run.](https://gist.github.com/onevcat/bbf42778888180c443bea78f395f255b)

### View the Report

After every run, argue prints a hint telling you how to open the report in the hosted viewer:

```
→ View report: argue view argue_1712345678901_a3f9c2
```

You can also open the most recent run directly:

```bash
argue view                  # open the most recent run
argue view <request-id>     # open a specific run
argue run --view            # open automatically after a run completes
```

The report is gzip-compressed and base64url-encoded into the URL fragment, then decoded entirely in the browser — **nothing is uploaded to any server**. The default viewer is hosted at `https://argue.onev.cat/`. To point at a different viewer (for example, during local viewer development), set `viewer.url` in your config or pass `--viewer-url https://your-viewer/`.

### Common Options

For complex or repeated tasks, use an [input JSON file](https://github.com/onevcat/argue/blob/master/packages/argue-cli/examples/task.example.json) instead of inline flags:

```bash
argue run --input task.json
```

Useful flags:

```bash
--agents a1,a2                            # pick specific agents from config
--min-participants 2                      # minimum surviving participants required to continue
--on-insufficient-participants interrupt  # interrupt (default) or fail hard
--min-rounds 2                            # at least 2 debate rounds before early-stop
--max-rounds 5                            # cap total debate rounds
--threshold 0.67                          # consensus threshold (default: 1.0 = unanimous)
--action "Fix it"                         # post-debate action for the representative
--verbose                                 # show each agent's reasoning in real time
```

Run `argue --help` for the full list.

> **Behavior change in 0.5.0:** when surviving participants drop below `minParticipants`, argue now returns a structured `interrupted` result instead of throwing a hard error. Pass `--on-insufficient-participants fail` (or set `defaults.participantsPolicy.onInsufficientParticipants: "fail"` in config) to restore the previous behavior.

## Using as a Library

Behind argue-cli is `@onevcat/argue`, a standalone debate engine you can embed in any system. Implement one interface — `AgentTaskDelegate` — and the engine handles all orchestration.

### Install

```bash
npm install @onevcat/argue
```

### Implement the Delegate

```ts
import type { AgentTaskDelegate } from "@onevcat/argue";

const delegate: AgentTaskDelegate = {
  async dispatch(task) {
    // Fire off the task and return a taskId immediately.
    // The engine dispatches all participants in parallel, then awaits
    // results separately — so this should return quickly without waiting for completion.
    const taskId = await myAgentFramework.submit(task);
    return { taskId, participantId: task.participantId, kind: task.kind };
  },

  async awaitResult(taskId, timeoutMs) {
    // Called per task to collect the result. The engine uses the taskId
    // to track timeouts, eliminations, and progressive settlement.
    const result = await myAgentFramework.waitFor(taskId, timeoutMs);
    return { ok: true, output: result };
  }
};
```

### Run the Engine

```ts
import { ArgueEngine, MemorySessionStore, DefaultWaitCoordinator } from "@onevcat/argue";

const engine = new ArgueEngine({
  taskDelegate: delegate,
  sessionStore: new MemorySessionStore(),
  waitCoordinator: new DefaultWaitCoordinator(delegate)
});

const result = await engine.start({
  requestId: "review-42",
  task: "Review PR #42 for security and correctness issues",
  participants: [
    { id: "security-agent", role: "security-reviewer" },
    { id: "arch-agent", role: "architecture-reviewer" },
    { id: "correctness-agent", role: "correctness-reviewer" }
  ],
  roundPolicy: { minRounds: 2, maxRounds: 4 },
  consensusPolicy: { threshold: 0.67 },
  reportPolicy: { composer: "representative" },
  actionPolicy: {
    prompt: "Fix all identified issues and post a summary comment."
  }
});

// result.status → "consensus" | "partial_consensus" | "unresolved" | "interrupted" | "failed"
// result.claimResolutions → per-claim vote outcomes
// result.representative → highest-scoring agent
// result.action → action output (if actionPolicy was set)
```

### Integration Example: Claude Code Hook

You can wire argue into existing tools via hooks. For example, as a [Claude Code hook](https://docs.anthropic.com/en/docs/claude-code/hooks) that triggers multi-agent review before every commit:

```jsonc
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ./hooks/argue-review.mjs \"$TASK_INPUT\""
          }
        ]
      }
    ]
  }
}
```

```ts
// hooks/argue-review.mjs
import { ArgueEngine, MemorySessionStore, DefaultWaitCoordinator } from "@onevcat/argue";

// Your delegate implementation dispatches to your agent infrastructure
import { createDelegate } from "./my-delegate.mjs";

const input = JSON.parse(process.argv[2]);
if (!input.command?.includes("git commit")) process.exit(0);

const delegate = createDelegate();
const engine = new ArgueEngine({
  taskDelegate: delegate,
  sessionStore: new MemorySessionStore(),
  waitCoordinator: new DefaultWaitCoordinator(delegate)
});

const result = await engine.start({
  requestId: `pre-commit-${Date.now()}`,
  task: "Review staged changes for bugs, security issues, and style violations",
  participants: [
    { id: "security", role: "security-reviewer" },
    { id: "quality", role: "code-quality-reviewer" }
  ],
  roundPolicy: { minRounds: 1, maxRounds: 2 },
  consensusPolicy: { threshold: 1.0 }
});

if (result.status !== "consensus") {
  console.error("Review did not reach consensus. Blocking commit.");
  process.exit(1);
}
```

## How It Works

### Debate Flow

```
+------+                      +--------+                           +---------+         +---------+
| Host |                      | Engine |                           | Agent A |         | Agent B |
+------+                      +--------+                           +---------+         +---------+
    |                              |                                    |                   |
    |  start(task, participants)   |                                    |                   |
    |------------------------------>                                    |                   |
    |                              |                                    |                   |
    |                              |                 +-------------------+                  |
    |                              |                 | Round 0 - Initial |                  |
    |                              |                 +-------------------+                  |
    |                              |                                    |                   |
    |                              |         dispatch(initial)          |                   |
    |                              |------------------------------------>                   |
    |                              |                   dispatch(initial)|                   |
    |                              |-------------------------------------------------------->
    |                              |              claims                |                   |
    |                              <....................................|                   |
    |                              |                        claims      |                   |
    |                              <........................................................|
    |                              |                                    |                   |
    |                              |                +---------------------+                 |
    |                              |                | Round 1..N - Debate |                 |
    |                              |                +---------------------+                 |
    |                              |                                    |                   |
    |                              |  dispatch(debate + peer context)   |                   |
    |                              |------------------------------------>                   |
    |                              |            dispatch(debate + peer context)             |
    |                              |-------------------------------------------------------->
    |                              |        judgements, merges          |                   |
    |                              <....................................|                   |
    |                              |                  judgements, merges|                   |
    |                              <........................................................|
    |                              |                                    |                   |
    |                       +-------------+                             |                   |
    |                       | early-stop? |                             |                   |
    |                       +-------------+                             |                   |
    |                              |                                    |                   |
    |                              |              +------------------------+                |
    |                              |              | Round N+1 - Final Vote |                |
    |                              |              +------------------------+                |
    |                              |                                    |                   |
    |                              |       dispatch(final_vote)         |                   |
    |                              |------------------------------------>                   |
    |                              |                 dispatch(final_vote)                   |
    |                              |-------------------------------------------------------->
    |                              |      accept/reject per claim       |                   |
    |                              <....................................|                   |
    |                              |                accept/reject per claim                 |
    |                              <........................................................|
    |                              |                                    |                   |
    |                   +---------------------+                         |                   |
    |                   | consensus + scoring |                         |                   |
    |                   +---------------------+                         |                   |
    |                              |                                    |                   |
    |                              |         dispatch(report)           |                   |
    |                              |------------------------------------>                   |
    |                              |       representative report        |                   |
    |                              <....................................|                   |
    |                              |                                    |                   |
    |         ArgueResult          |                                    |                   |
    <..............................|                                    |                   |
    |                              |                                    |                   |
+------+                      +--------+                           +---------+         +---------+
| Host |                      | Engine |                           | Agent A |         | Agent B |
+------+                      +--------+                           +---------+         +---------+
```

### Phase Rules

| Phase                 | What agents do                                                    | What the engine does                                    |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| **Initial** (round 0) | Propose claims, judge existing ones                               | Collect all claims into a shared pool                   |
| **Debate** (1..N)     | Judge peers' claims (`agree`/`disagree`/`revise`), propose merges | Merge duplicates, track stance shifts, check early-stop |
| **Final Vote** (N+1)  | Cast `accept`/`reject` per active claim                           | Compute per-claim consensus against threshold           |

### Key Mechanisms

- **Claim lifecycle**: Each claim is `active`, `merged`, or `withdrawn`. Merged claims transfer their proposers to the surviving claim.
- **Early stop**: If all judgements agree and no new claims emerge for `minRounds`, debate ends early — no wasted rounds.
- **Elimination**: Agents that timeout or error are permanently removed. Consensus denominators adjust automatically.
- **Scoring**: Agents are scored on correctness (35%), completeness (25%), actionability (25%), and consistency (15%) via peer review.
- **Representative**: The highest-scoring agent composes the final report. Falls back to a built-in summary on failure.
- **Action**: Optionally, the representative (or a designated agent) executes a real-world action based on the consensus.

### Provider Types

The CLI supports four provider types for connecting agents:

| Type   | Use case                             | Example                                              |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| `cli`  | Coding agents with CLI interfaces    | Claude Code, Codex CLI, Copilot CLI, Gemini CLI      |
| `api`  | Direct model API access              | OpenAI, Anthropic, Ollama, any OpenAI-compatible API |
| `sdk`  | Custom adapters for agent frameworks | Your own SDK integration                             |
| `mock` | Testing and development              | Deterministic responses, simulated timeouts          |

## Config Reference

Full config example at [`packages/argue-cli/examples/config.example.json`](packages/argue-cli/examples/config.example.json).

`reasoning` is an optional string on both provider model config and agent config:

- `providers.<id>.models.<modelId>.reasoning`: model-level default
- `agents[].reasoning`: per-agent override

Reasoning passthrough is best-effort and depends on provider type/runtime path:

- `cli` providers:
  - `claude` → `--effort <reasoning>`
  - `codex` → `-c model_reasoning_effort=<reasoning>`
  - `generic` → included in the stdin envelope as `agent.reasoning`
  - other `cliType` values → no-op with a warning (once per runner)
- `api` providers: currently no-op (field is accepted in config but not forwarded yet)

User responsibility:

- `argue` only stores/forwards the string and does not validate provider-specific accepted values.
- Compatibility with downstream model/tool capabilities is up to the user.
- If a provider rejects a value, the error surfaces from the downstream runtime/API.

Config lookup order:

1. `--config <path>` flag
2. `./argue.config.json` (local)
3. `~/.config/argue/config.json` (global)

CLI flags override input JSON, which overrides config defaults.

## Development

```bash
npm install
npm run dev              # watch mode
npm run ci               # typecheck + test + build
npm run release:check    # plus tarball smoke tests
```

## License

MIT
