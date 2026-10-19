# Seat icons

The marks the debate desk, saved reports and PDFs use for each seat. They are free to reuse in
any argue tool or fork (MIT, like the rest of this repo).

These are simple generic marks in each family's well-known colors, **not official logos**; the
product names and their trademarks belong to their owners.

How a seat gets its icon: the **model id** is matched first (so an Antigravity seat running
`claude-opus-*` shows the Claude mark), then the **CLI** it runs, then a neutral fallback.
To add a family, add an entry to `packages/argue-cli/src/ui/themes.ts` and run:

```bash
npm run build -w packages/argue-cli && node scripts/export-seat-icons.mjs
```

| Icon                                                   | Family             | Color                                                              | Mark       | Model ids matched | CLIs                    |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------ | ---------- | ----------------- | ----------------------- | ----------------------- | -------- | --------- | --------- | -------- | ------ |
| <img src="claude.svg" width="40" height="40" alt="">   | **Claude**         | `#D97757`                                                          | ✻          | `claude           | opus                    | sonnet                  | haiku    | fable`    | `claude`  |
| <img src="chatgpt.svg" width="40" height="40" alt="">  | **ChatGPT**        | `#1f1f1f`                                                          | drawn knot | `^gpt             | ^o[1-9]                 | codex                   | chatgpt` | `codex`   |
| <img src="gemini.svg" width="40" height="40" alt="">   | **Gemini**         | `#7b6fd8` (gradient `#4285F4` → `#9B72CB` → `#D96570`)             | ✦          | `gemini           | gemma`                  | `antigravity`, `gemini` |
| <img src="meta.svg" width="40" height="40" alt="">     | **Meta Llama**     | `#0866FF`                                                          | ∞          | `llama            | meta`                   | —                       |
| <img src="mistral.svg" width="40" height="40" alt="">  | **Mistral**        | `#FA520F` (gradient `#FFD800` → `#FF8205` → `#FA500F` → `#E10500`) | ▚          | `mistral          | mixtral                 | codestral               | devstral | magistral | ministral | pixtral` | `vibe` |
| <img src="qwen.svg" width="40" height="40" alt="">     | **Qwen**           | `#615CED`                                                          | ◈          | `qwen             | qwq`                    | `qwen`                  |
| <img src="deepseek.svg" width="40" height="40" alt=""> | **DeepSeek**       | `#4D6BFE`                                                          | ◗          | `deepseek`        | —                       |
| <img src="grok.svg" width="40" height="40" alt="">     | **Grok**           | `#2b2b2b`                                                          | ⨯          | `grok`            | —                       |
| <img src="kimi.svg" width="40" height="40" alt="">     | **Kimi**           | `#1f2937`                                                          | ☾          | `kimi             | moonshot`               | `kimi`                  |
| <img src="copilot.svg" width="40" height="40" alt="">  | **GitHub Copilot** | `#8250DF`                                                          | ◉          | —                 | `copilot`               |
| <img src="cursor.svg" width="40" height="40" alt="">   | **Cursor**         | `#2d2d2d`                                                          | ⬢          | —                 | `cursor-agent`, `agent` |
| <img src="ollama.svg" width="40" height="40" alt="">   | **Ollama**         | `#3a3a3a`                                                          | ◔          | —                 | `ollama`                |
| <img src="goose.svg" width="40" height="40" alt="">    | **Goose**          | `#2f3b4a`                                                          | ◒          | —                 | `goose`                 |
| <img src="aider.svg" width="40" height="40" alt="">    | **Aider**          | `#14A33C`                                                          | ✎          | —                 | `aider`                 |
| <img src="llm.svg" width="40" height="40" alt="">      | **llm**            | `#5b6573`                                                          | ›          | —                 | `llm`                   |
| <img src="opencode.svg" width="40" height="40" alt=""> | **opencode**       | `#3b3b3b`                                                          | ▣          | —                 | `opencode`              |
| <img src="amp.svg" width="40" height="40" alt="">      | **Amp**            | `#E5484D`                                                          | ϟ          | —                 | `amp`                   |
| <img src="droid.svg" width="40" height="40" alt="">    | **Factory droid**  | `#e05d2a`                                                          | ◇          | —                 | `droid`                 |
| <img src="pi.svg" width="40" height="40" alt="">       | **pi**             | `#0f766e`                                                          | π          | —                 | `pi`                    |

`palette.json` has the same data for other tools.
