// The debate desk UI: one self-contained page (no external assets, no build step).
// Written with String.raw so regexes keep their backslashes; the client code below
// deliberately avoids backticks and dollar-brace so nothing is interpolated by this module.
// All model-generated text is inserted with textContent, never innerHTML.

import { EFFORT_LABELS } from "../cli-catalog.js";
import { DESK_THEMES, type DeskTheme } from "../config.js";
import { SEAT_THEMES } from "./themes.js";

export function renderUiPage(options: { theme?: DeskTheme } = {}): string {
  // Theme data is our own constant; "<" is still escaped so it can never close the script tag.
  const theme = DESK_THEMES.find((t) => t === options.theme) ?? "system";
  return PAGE.replace("/*SEAT_THEMES*/[]", JSON.stringify(SEAT_THEMES).replace(/</g, "\\u003c"))
    .replace("/*EFFORT_LABELS*/{}", JSON.stringify(EFFORT_LABELS))
    .replace('/*DESK_THEME*/"system"', JSON.stringify(theme));
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>argue · debate desk</title>
<script>
// The saved theme (workspace config, filled in by the server), applied before the first paint so a
// dark page never flashes light. "system" follows this computer's setting.
(function () {
  var pref = /*DESK_THEME*/"system";
  var dark = pref === "dark" || (pref !== "light" && !!window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme-pref", pref);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%23D97757' stroke-width='4' stroke-dasharray='27 100'/%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%231f1f1f' stroke-width='4' stroke-dasharray='27 100' stroke-dashoffset='-27.2'/%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%239B72CB' stroke-width='4' stroke-dasharray='27 100' stroke-dashoffset='-54.4'/%3E%3C/svg%3E">
<style>
:root {
  --bg: #f6f2ea; --bg2: #efe9de; --panel: #fffdf9; --ink: #1d1b18; --ink2: #3a3631; --muted: #7a736a; --line: #e6dfd3;
  --soft: #f1ece3; --accent: #2f2b26; --focus: #c9b99e;
  --agree: #2f7d4a; --agree-bg: #e5f2e8; --disagree: #b93a32; --disagree-bg: #fbe9e7;
  --revise: #a8650a; --revise-bg: #fbf0dc; --live: #3d5bd9; --live-bg: #e9edff;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --sans: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
  --mono: "Cascadia Mono", "SF Mono", Consolas, ui-monospace, monospace;
  --shadow: 0 1px 1px rgba(40, 30, 10, .04), 0 6px 22px rgba(40, 30, 10, .06);
  --claude: #D97757; --claude-soft: #fbeae2;
  --codex: #1f1f1f; --codex-soft: #e9e8e6;
  --gemini: #7b6fd8; --gemini-soft: #ecebfb;
  --gemini-g: linear-gradient(100deg, #4285F4 0%, #9B72CB 55%, #D96570 100%);
  --field: #fff; --field2: #fdfbf7; --claim-bg: #fffcf7; --hover: #fffaf2; --bubble: #ece5d8;
  --line-strong: #d5cab6; --dash: #d8cdb9; --placeholder: #a39a8d; --em: #8a5a3c; --on-ink: #fff;
  --glow: #fbf7f0; --aside-bg: rgba(250, 246, 239, .82); --scrim: rgba(30, 24, 16, .32); --ring: rgba(201, 185, 158, .3);
  --shadow-lg: 0 2px 4px rgba(40, 30, 10, .04), 0 18px 48px rgba(40, 30, 10, .08);
  --shadow-xl: 0 2px 4px rgba(40, 30, 10, .05), 0 22px 56px rgba(40, 30, 10, .11);
  --shadow-pop: 0 10px 34px rgba(40, 30, 10, .16);
  color-scheme: light;
}
/* Dark theme: set on <html> by the theme switch (Light / Dark / Default = follow the system). */
:root[data-theme="dark"] {
  --bg: #181613; --bg2: #1f1c18; --panel: #221f1b; --ink: #ece7df; --ink2: #d0c9be; --muted: #9a9286; --line: #35302a;
  --soft: #2b2722; --accent: #ece7df; --focus: #8a7a60;
  --agree: #72c491; --agree-bg: #1d3125; --disagree: #f08b81; --disagree-bg: #3b211f;
  --revise: #e2a752; --revise-bg: #372a17; --live: #93a6ff; --live-bg: #222947;
  --shadow: 0 1px 1px rgba(0, 0, 0, .25), 0 6px 22px rgba(0, 0, 0, .28);
  --field: #1c1a16; --field2: #1f1c19; --claim-bg: #26221e; --hover: #28241f; --bubble: #312c25;
  --line-strong: #4b443a; --dash: #4b443a; --placeholder: #70695f; --em: #d79c72; --on-ink: #181613;
  --glow: #221e1a; --aside-bg: rgba(29, 26, 22, .88); --scrim: rgba(0, 0, 0, .55); --ring: rgba(138, 122, 96, .35);
  --shadow-lg: 0 2px 4px rgba(0, 0, 0, .2), 0 18px 48px rgba(0, 0, 0, .35);
  --shadow-xl: 0 2px 4px rgba(0, 0, 0, .25), 0 22px 56px rgba(0, 0, 0, .45);
  --shadow-pop: 0 10px 34px rgba(0, 0, 0, .5);
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 var(--sans); }
body { background: radial-gradient(1200px 600px at 85% -10%, var(--glow) 0%, transparent 60%), var(--bg); min-height: 100vh; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.app { display: grid; grid-template-columns: 352px 1fr; min-height: 100vh; }
aside { border-right: 1px solid var(--line); background: var(--aside-bg); backdrop-filter: blur(6px); padding: 22px 20px 18px;
  position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; }
main { padding: 34px 44px 90px; min-width: 0; max-width: 1180px; }

/* brand */
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.brand svg { width: 26px; height: 26px; }
.brand b { font: 600 22px/1 var(--serif); letter-spacing: -.01em; }
.brand span { color: var(--muted); font-size: 13px; margin-top: 3px; }
.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; margin: 22px 0 10px; }
.eyebrow:first-of-type { margin-top: 0; }

/* usage rings */
.usage { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 4px; }
.pod { position: relative; display: grid; justify-items: center; gap: 2px; padding: 10px 4px 8px; border-radius: 14px; cursor: default; }
.pod:hover { background: var(--panel); box-shadow: var(--shadow); }
.pod svg.ring { width: 60px; height: 60px; overflow: visible; }
.pod .track { fill: none; stroke-width: 6; }
.pod .fill { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1.1s cubic-bezier(.2, .8, .2, 1), stroke .4s; }
.pod .orbit { fill: none; stroke-width: 6; stroke-linecap: round; transform-origin: 30px 30px; animation: orbit 9s linear infinite; }
@keyframes orbit { to { transform: rotate(360deg); } }
.pod .glyph { font: 600 17px/1 var(--sans); }
.pod .num { font: 650 14px/1.2 var(--sans); margin-top: 4px; font-variant-numeric: tabular-nums; }
.pod .num small { font-weight: 500; color: var(--muted); font-size: 11px; }
.pod .sub { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pod .sub:empty { display: none; }
.pod .tip .check { margin-top: 8px; }
.pod .who { font-size: 11.5px; color: var(--muted); max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pod .tip { display: none; position: absolute; top: calc(100% - 2px); left: 50%; transform: translateX(-50%); z-index: 30; width: 268px; padding: 12px 14px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-pop); font-size: 12.5px; line-height: 1.55; text-align: left; }
.pod:first-child .tip { left: 0; transform: none; }
.pod:last-child .tip { left: auto; right: 0; transform: none; }
.pod:only-child .tip { left: 0; right: auto; transform: none; }
.pod:hover .tip { display: block; }
.tip b { display: block; font: 600 14px/1.3 var(--serif); margin-bottom: 6px; }
.tip .w { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 5px 0; border-top: 1px solid var(--soft); }
.tip .w:first-of-type { border-top: 0; }
.tip .w span:last-child { font-variant-numeric: tabular-nums; font-weight: 650; }
.tip .w small { grid-column: 1 / -1; color: var(--muted); }
.tip .muted { color: var(--muted); margin-top: 6px; }
@media (prefers-reduced-motion: reduce) { .pod .orbit { animation: none; } .pod .fill { transition: none; } }

/* sidebar form */
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
.form { padding: 16px; display: grid; gap: 13px; }
label.field, .field { display: grid; gap: 6px; font-size: 12.5px; color: var(--muted); font-weight: 650; }
.field .hint { font-weight: 400; }
textarea, select, input[type=text] { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; background: var(--field); font-weight: 400; color: var(--ink); }
textarea { min-height: 92px; resize: vertical; line-height: 1.5; }
textarea:focus, select:focus, input[type=text]:focus { outline: none; border-color: var(--focus); box-shadow: 0 0 0 3px var(--ring); }
.seats { display: grid; gap: 6px; }
.seat-opt { position: relative; display: grid; gap: 7px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 12px;
  color: var(--ink); font-weight: 600; background: var(--field); transition: border-color .15s; }
.seat-opt:hover { border-color: var(--line-strong); }
.seat-main { display: flex; align-items: center; gap: 10px; cursor: pointer; padding-right: 26px; }
.seat-main input { accent-color: var(--ink); margin: 0; }
/* Every seat gets the same pair: model, then effort ("Effort" until a level is picked). */
.seat-pick { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 6px; }
.dd { position: relative; min-width: 0; }
.dd-btn { display: flex; align-items: center; height: 30px; padding: 0 26px 0 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 12px;
  font-weight: 550; color: var(--ink2); cursor: pointer; user-select: none; background: var(--field2) no-repeat right 9px center / 9px 6px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 6'%3E%3Cpath d='M.8.8 4.5 4.6 8.2.8' fill='none' stroke='%23948b7f' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }
.dd-btn:hover { border-color: var(--line-strong); }
.dd-btn:focus-visible, .dd.open .dd-btn { outline: none; border-color: var(--focus); box-shadow: 0 0 0 3px var(--ring); }
.dd-btn[aria-disabled="true"] { cursor: default; opacity: .55; border-color: var(--line); }
.dd-btn.ph { color: var(--muted); }
.dd-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* placed by script next to its button (fixed, so no card or dialog can clip it) */
.dd-list { position: fixed; z-index: 80; width: max-content; max-width: min(320px, calc(100vw - 16px)); overflow-y: auto; padding: 4px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow-pop); }
/* the composer's pill-shaped pickers: "Rounds 3", "Agree Everyone" */
.dd.dd-pill .dd-btn { height: 32px; gap: 6px; padding: 0 30px 0 13px; border-radius: 999px; background-color: var(--field); background-position: right 12px center;
  font-size: 13px; }
.dd-prefix { flex: none; color: var(--muted); font-size: 12.5px; font-weight: 600; }
.dd.dd-pill .dd-text { color: var(--ink); font-weight: 650; }
.dd-group { padding: 8px 10px 3px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.dd-opt { position: relative; display: grid; gap: 1px; padding: 6px 10px 6px 27px; border-radius: 7px; cursor: pointer; }
.dd-opt .t { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.dd-opt .d { font-size: 11px; line-height: 1.35; color: var(--muted); }
.dd-opt.active { background: var(--soft); }
.dd-opt[aria-selected="true"]::before { content: ""; position: absolute; left: 10px; top: 11px; width: 8px; height: 4px; border: solid var(--ink);
  border-width: 0 0 1.6px 1.6px; transform: rotate(-45deg); }
.seat-opt .rm { display: none; position: absolute; right: 6px; top: 7px; border: 0; background: var(--panel); color: var(--muted);
  width: 24px; height: 24px; border-radius: 7px; font-size: 15px; line-height: 1; }
.seat-opt:hover .rm, .seat-opt:focus-within .rm { display: block; }
.seat-opt .rm:hover { color: var(--disagree); background: var(--disagree-bg); }
.mark { width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; flex: none; }
:root[data-theme="dark"] .mark { box-shadow: 0 0 0 1px rgba(255, 255, 255, .08); }
.link-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px dashed var(--dash); background: transparent; border-radius: 11px; padding: 8px 10px; color: var(--ink2); font-weight: 600; font-size: 13px; text-align: left; }
.link-btn:hover { background: var(--field); border-style: solid; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.btn { border: 0; border-radius: 11px; padding: 11px 16px; font-weight: 650; background: var(--ink); color: var(--on-ink); letter-spacing: .01em; transition: transform .1s, opacity .15s; }
.btn:hover { opacity: .92; }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); font-weight: 600; padding: 7px 12px; }
.btn.ghost:hover { background: var(--field); }
.btn.small { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; font-size: 12.5px; }
.btn.danger { background: var(--disagree-bg); color: var(--disagree); }
.hint { font-size: 12px; color: var(--muted); margin: 0; line-height: 1.5; }
.err { color: var(--disagree); font-size: 13px; margin: 0; white-space: pre-wrap; }
.runs { display: grid; gap: 6px; }
.run-item { text-align: left; border: 1px solid transparent; border-radius: 12px; padding: 9px 11px; background: transparent; display: grid; gap: 3px; }
.run-item:hover { background: var(--panel); border-color: var(--line); }
.run-item.active { background: var(--panel); border-color: var(--line-strong); box-shadow: var(--shadow); }
.run-item .t { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-item .m { display: flex; gap: 8px; align-items: center; font-size: 11.5px; color: var(--muted); }
.side-foot { margin-top: auto; padding-top: 18px; display: flex; align-items: center; gap: 8px; }
.attach { display: grid; gap: 6px; }
.attach-list { display: flex; flex-wrap: wrap; gap: 6px; }
.attach-list:empty { display: none; }
.file-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 4px 3px 8px; border-radius: 999px; background: var(--soft);
  font-size: 12px; font-weight: 600; color: var(--ink2); }
.file-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 190px; }
.file-chip button { border: 0; background: transparent; color: var(--muted); width: 20px; height: 20px; border-radius: 50%; }
.file-chip button:hover { background: var(--disagree-bg); color: var(--disagree); }
.library { padding: 12px 14px; display: grid; gap: 8px; }
.lib-path { font-family: var(--mono); font-size: 11.5px; color: var(--ink2); word-break: break-all; background: var(--field2); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.lib-actions, .run-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.side-foot .hint { flex: 1; }

/* pills */
.pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--soft); color: var(--muted); white-space: nowrap; }
.pill.consensus, .pill.accept, .pill.agree { background: var(--agree-bg); color: var(--agree); }
.pill.failed, .pill.reject, .pill.disagree, .pill.eliminated { background: var(--disagree-bg); color: var(--disagree); }
.pill.limit { background: var(--revise-bg); color: var(--revise); }
.limit-note { margin: 2px 0 0; font-size: 14px; color: var(--ink2); }
.drop-error .mono.prose { word-break: break-word; max-height: 260px; overflow: auto; }
.pill.partial_consensus, .pill.interrupted, .pill.revise, .pill.stale, .pill.stopped, .pill.unresolved { background: var(--revise-bg); color: var(--revise); }
.pill.in_progress, .pill.running { background: var(--live-bg); color: var(--live); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.pill.running .dot, .pill.in_progress .dot, .waiting .dot { animation: pulse 1.2s infinite ease-in-out; }
@keyframes pulse { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }

/* main */
.empty { color: var(--muted); padding: 90px 10px; text-align: center; }
.empty b { color: var(--ink); display: block; font: 600 26px/1.3 var(--serif); margin-bottom: 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); font-weight: 650; color: var(--ink); font-size: 12.5px; }
.mono { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
.section { margin-top: 34px; }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.section-head h3, .section > h3 { margin: 0 auto 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; }
.section > h3 { margin-bottom: 12px; }
.verdict { padding: 24px 28px; position: relative; overflow: hidden; }
.verdict::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--agree); }
.verdict.partial_consensus::before, .verdict.interrupted::before, .verdict.unresolved::before { background: var(--revise); }
.verdict.failed::before { background: var(--disagree); }
.verdict p.big { font: 400 20px/1.55 var(--serif); margin: 10px 0 0; color: var(--ink); }
details > summary { cursor: pointer; color: var(--ink2); font-weight: 650; font-size: 13px; list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details.more > summary::before { content: "+ "; color: var(--muted); }
details.more[open] > summary::before { content: "− "; }
.prose { white-space: pre-wrap; margin: 10px 0 0; }
.verdict .prose { font: 400 16px/1.65 var(--serif); color: var(--ink2); }
.mark svg { width: 70%; height: 70%; }
/* who argued what: seat marks beside each passage of the report, and in the claims table */
.sources { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 16px; }
.sources-label { font-size: 12px; color: var(--muted); font-weight: 600; margin-right: 2px; }
.sources .chip { cursor: default; }
.sources .chip small { color: var(--muted); font-weight: 600; margin-left: 1px; }
.sources .chip.none { opacity: .55; }
.answer { margin-top: 10px; font: 400 16px/1.65 var(--serif); color: var(--ink2); }
.answer > .hint { font-family: var(--sans); margin: 0 0 8px; }
.answer .blk { display: grid; grid-template-columns: minmax(0, 1fr); }
.answer.cited .blk { grid-template-columns: 70px minmax(0, 1fr); column-gap: 12px; }
.answer .src { display: flex; flex-wrap: wrap; justify-content: flex-end; align-content: flex-start; gap: 3px; padding-top: 5px; }
.answer .src .mark { width: 20px; height: 20px; font-size: 11px; }
.answer .blk.h .src { padding-top: 18px; }
.answer .txt { margin: 4px 0; min-width: 0; }
.answer h4.txt { font: 600 17px/1.35 var(--serif); color: var(--ink); margin: 16px 0 2px; }
.answer .txt b { color: var(--ink); }
.answer .li { position: relative; padding-left: calc(20px + var(--lvl, 0) * 20px); }
.answer .li::before { content: attr(data-bullet); position: absolute; left: calc(var(--lvl, 0) * 20px); color: var(--muted); font-variant-numeric: tabular-nums; }
.answer code { font: 12.5px var(--mono); background: var(--soft); padding: 1px 5px; border-radius: 5px; }
.cite { display: inline-flex; vertical-align: -3px; margin: 0 2px; }
.cite .mark { width: 16px; height: 16px; font-size: 9px; }
.by-seat { display: inline-flex; align-items: center; gap: 4px; margin-right: 9px; color: var(--ink2); font-weight: 600; }
.by-seat .mark { width: 16px; height: 16px; font-size: 9px; }
@media (max-width: 600px) { .answer.cited .blk { grid-template-columns: 43px minmax(0, 1fr); column-gap: 8px; } }

/* rounds */
details.round { margin-bottom: 10px; }
details.round > summary { color: var(--ink); font-weight: 400; font-size: 14px; padding: 14px 18px; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center; gap: 6px 12px; border-radius: 16px; }
details.round > summary::before { content: "›"; color: var(--muted); font-size: 18px; line-height: 1; transition: transform .2s; display: inline-block; width: 10px; }
details.round[open] > summary::before { transform: rotate(90deg); }
details.round > summary:hover { background: var(--hover); }
details.round[open] > summary { border-bottom: 1px solid var(--line); border-radius: 16px 16px 0 0; }
details.round > .lanes, details.round > .note { margin: 14px 16px; }
details.round > .note:last-child { margin-bottom: 16px; }
.round-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.round-title b { font: 600 16px/1.3 var(--serif); }
.round-title span { color: var(--muted); font-size: 12.5px; }
.round-meta { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
@media (max-width: 1240px) { .round-meta { grid-column: 2 / -1; justify-content: flex-start; } }
.seat-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 650; padding: 2px 8px 2px 3px; border-radius: 999px; background: var(--soft); color: var(--ink); }
.seat-chip .st { font-size: 11px; }
.seat-chip.done .st { color: var(--agree); }
.seat-chip.dropped .st { color: var(--disagree); }
.seat-chip.thinking .st { color: var(--live); }
.seat-chip.thinking .dot { width: 6px; height: 6px; background: var(--live); animation: pulse 1.2s infinite ease-in-out; }
.round-stats { font-size: 12px; color: var(--muted); margin-left: 4px; }
.lanes { display: grid; gap: 12px; }
.lane { padding: 16px 18px; min-width: 0; position: relative; overflow: hidden; border-radius: 14px; }
.lane::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--g, var(--c)); }
.lane-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.lane-head b { font-size: 15px; }
.lane-head .model { color: var(--muted); font-size: 11.5px; }
.lane-head .pill { margin-left: auto; }
.summary { font-weight: 600; margin: 0 0 10px; color: var(--ink2); }
.block-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); font-weight: 750; margin: 14px 0 7px; }
.claim { border: 1px solid var(--line); border-radius: 11px; padding: 9px 11px; margin-bottom: 7px; background: var(--claim-bg); }
.claim .id { font-family: var(--mono); font-size: 11px; color: var(--muted); }
.claim .title { font-weight: 650; }
.claim p { margin: 3px 0 0; font-size: 14px; color: var(--ink2); }
.judgement { border-left: 3px solid var(--line); padding: 4px 0 6px 11px; margin-bottom: 11px; }
.judgement.agree { border-left-color: var(--agree); }
.judgement.disagree { border-left-color: var(--disagree); }
.judgement.revise { border-left-color: var(--revise); }
.j-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.target { font-weight: 650; }
.conf { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11.5px; margin-left: auto; }
.bar { width: 56px; height: 5px; border-radius: 3px; background: var(--soft); overflow: hidden; display: inline-block; }
.bar > i { display: block; height: 100%; background: var(--ink2); }
.rationale { margin: 4px 0 0; font-size: 14px; color: var(--ink2); }
.revised { margin: 6px 0 0; font-size: 14px; background: var(--revise-bg); border-radius: 9px; padding: 7px 10px; }
.revised b { color: var(--revise); font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; margin-right: 5px; }
.note { font-size: 12.5px; color: var(--muted); padding: 8px 12px; background: var(--soft); border-radius: 10px; margin: 8px 0 0; }
.waiting { color: var(--live); display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 6px 0; }
.waiting .dot { background: var(--live); }

/* claims + scores */
.claims-table { width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed; }
.claims-table td.tally { width: 190px; }
.claims-table td.tally .pill { white-space: normal; text-align: right; }
.claims-table td { padding: 13px 18px; border-top: 1px solid var(--line); vertical-align: top; }
.claims-table tr:first-child td { border-top: 0; }
.claims-table .ct { font: 600 15.5px/1.35 var(--serif); }
.claims-table .stmt { margin: 4px 0 0; color: var(--ink2); }
.claims-table .by { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
.claims-table tr.merged { opacity: .62; }
.tally { text-align: right; }
@media (max-width: 600px) { .claims-table td.tally { width: 110px; } }
.grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
.score { padding: 16px 18px; display: grid; gap: 9px; position: relative; overflow: hidden; }
.score::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--g, var(--c)); }
.score-row { display: grid; grid-template-columns: 108px 1fr 30px; align-items: center; gap: 10px; font-size: 12.5px; }
.score-row .track { height: 7px; background: var(--soft); border-radius: 4px; overflow: hidden; }
.score-row .track i { display: block; height: 100%; border-radius: 4px; background: var(--g, var(--c)); }
.score-total { display: flex; align-items: baseline; gap: 10px; }
.score-total b { font: 600 28px/1 var(--serif); font-variant-numeric: tabular-nums; }
.score-total .crown { margin-left: auto; font-size: 11px; color: var(--muted); font-weight: 650; }

/* modal + overlays */
.scrim { position: fixed; inset: 0; background: var(--scrim); backdrop-filter: blur(3px); display: grid; place-items: center; z-index: 50; padding: 16px; }
.modal { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 22px 24px; }
.modal h2 { font: 600 22px/1.3 var(--serif); margin: 0 0 4px; }
.cli-list { display: grid; gap: 7px; margin: 14px 0; }
.cli-opt { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); text-align: left; cursor: pointer; }
.cli-opt:hover { border-color: var(--line-strong); }
.cli-opt.sel { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.cli-opt small { color: var(--muted); display: block; font-size: 11.5px; }
.cli-opt .pick { margin-left: auto; }
.modal .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.closed-screen { text-align: center; max-width: 420px; padding: 34px 30px; }
/* the desk's own confirm / ask boxes and short notices */
.modal.dialog { width: min(420px, 100%); }
.dialog h2 { font: 600 19px/1.3 var(--serif); margin: 0 0 8px; }
.dialog-text { margin: 0; color: var(--ink2); font-size: 14px; line-height: 1.55; }
.dialog input[type=text] { margin-top: 14px; }
.toasts { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 90; display: grid; gap: 8px; width: max-content; max-width: calc(100vw - 32px); }
.toast { display: flex; align-items: center; gap: 10px; padding: 9px 8px 9px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel);
  color: var(--ink); box-shadow: var(--shadow-pop); font-size: 13.5px; }
.toast.error { border-left: 3px solid var(--disagree); }
.toast-x { border: 0; background: transparent; color: var(--muted); width: 24px; height: 24px; border-radius: 7px; font-size: 15px; line-height: 1; flex: none; }
.toast-x:hover { background: var(--soft); color: var(--ink); }
/* line icons */
.ico { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.file-chip .ico { width: 14px; height: 14px; color: var(--muted); }
::placeholder { color: var(--placeholder); opacity: 1; }
.closed-screen b { display: block; font: 600 24px/1.3 var(--serif); margin-bottom: 8px; }

@media (max-width: 920px) {
  .app { grid-template-columns: 1fr; }
  aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  main { padding: 24px 16px 70px; }
}
@media (max-width: 680px) { .lanes { grid-template-columns: 1fr !important; } }

/* ---------- app layout: chat-style sidebar + centred main ---------- */
.app { grid-template-columns: 284px 1fr; }
aside.sidebar { padding: 18px 14px 14px; gap: 0; background: var(--aside-bg); }
.sidebar .brand { padding: 2px 8px 14px; margin: 0; }
.new-btn { display: flex; align-items: center; gap: 9px; width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--panel); color: var(--ink); font-weight: 650; font-size: 14px; box-shadow: var(--shadow); transition: border-color .15s, transform .1s; }
.new-btn span { font-size: 16px; line-height: 1; color: var(--muted); }
.new-btn:hover { border-color: var(--line-strong); }
.new-btn:active { transform: translateY(1px); }
.new-btn.active { border-color: var(--ink); }
.history { flex: 1; overflow-y: auto; margin: 14px -4px 10px; padding: 0 4px; min-height: 120px; }
.history .group { font-size: 10.5px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; margin: 14px 8px 6px; }
.history .group:first-child { margin-top: 2px; }
.run-item { width: 100%; padding: 8px 10px; border-radius: 10px; gap: 2px; }
.run-item .t { font-weight: 550; font-size: 13.5px; color: var(--ink2); }
.run-item.active .t { color: var(--ink); font-weight: 650; }
.run-item .m { font-size: 11px; }
.run-item .pill { padding: 0 7px; font-size: 10.5px; }
.side-bottom { border-top: 1px solid var(--line); padding-top: 12px; display: grid; gap: 6px; }
.side-bottom .eyebrow { margin: 0 6px 2px; }
.side-bottom .usage { margin: 0; }
.side-bottom .pod svg.ring { width: 46px; height: 46px; }
.side-bottom .pod .num { font-size: 12.5px; margin-top: 2px; }
.side-bottom .pod .sub { font-size: 10.5px; }
.side-bottom .pod .tip { top: auto; bottom: calc(100% - 4px); }
details.library { border-radius: 12px; padding: 4px 6px; }
details.library > summary { list-style: none; display: flex; align-items: baseline; gap: 8px; cursor: pointer; padding: 4px 0; color: var(--ink2); }
details.library > summary::-webkit-details-marker { display: none; }
details.library > summary .eyebrow { margin: 0; }
details.library[open] { background: var(--panel); border: 1px solid var(--line); padding: 8px 10px 10px; display: grid; gap: 8px; }
.lib-short { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; text-align: right; }
.side-foot { margin-top: 2px; padding: 4px 6px 0; }
.arc-ink { stroke: var(--ink); }
.theme-row { display: flex; align-items: center; gap: 8px; padding: 2px 6px; }
.theme-row .eyebrow { margin: 0; flex: 1; }
.seg { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--line); border-radius: 10px; background: var(--soft); }
.seg button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--muted); border-radius: 8px;
  padding: 4px 8px; font-size: 12px; font-weight: 600; }
.seg button svg { width: 13px; height: 13px; flex: none; }
.seg button:hover { color: var(--ink); }
.seg button[aria-checked="true"] { background: var(--panel); color: var(--ink); box-shadow: var(--shadow); }

main { max-width: none; padding: 0 40px 90px; display: flex; flex-direction: column; align-items: center; }
#banner-slot { width: 100%; max-width: 880px; padding-top: 18px; }
.composer-view, .run-view { width: 100%; max-width: 880px; }
.run-view { padding-top: 26px; }

/* ---------- new debate: centred hero + composer ---------- */
.composer-view { min-height: calc(100vh - 40px); display: flex; flex-direction: column; justify-content: center; padding: 48px 0 40px; }
.hero { text-align: center; margin-bottom: 26px; }
.hero-mark { width: 46px; height: 46px; margin-bottom: 14px; }
.hero-title { font: 500 46px/1.08 var(--serif); letter-spacing: -.022em; margin: 0; color: var(--ink); text-wrap: balance; }
.hero-title em { font-style: italic; color: var(--em); }
.composer { background: var(--panel); border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow-lg);
  padding: 16px 16px 12px; transition: border-color .2s, box-shadow .2s; }
.composer:focus-within { border-color: var(--line-strong); box-shadow: var(--shadow-xl); }
.composer textarea { border: 0; background: transparent; padding: 6px 8px; min-height: 84px; max-height: 340px; font: 400 18px/1.55 var(--serif); color: var(--ink); resize: none; }
.composer textarea::placeholder { color: var(--placeholder); font-style: italic; }
.composer textarea:focus { box-shadow: none; outline: none; }
.composer .attach-list { padding: 4px 8px 6px; }
.composer-bar { display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid var(--soft); flex-wrap: wrap; }
.tool-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--field); color: var(--ink2); border-radius: 999px;
  padding: 6px 12px; font-size: 13px; font-weight: 600; }
.tool-btn:hover { border-color: var(--line-strong); }
.spacer { flex: 1; }
.kbd-hint { font-size: 11.5px; color: var(--muted); font-family: var(--mono); }
.btn.start { border-radius: 999px; padding: 9px 18px; }
.composer-view > .err { margin: 10px 6px 0; }
.seats-panel { margin-top: 22px; }
.seats-head { display: flex; align-items: center; justify-content: space-between; margin: 0 4px 10px; }
.seats-head .eyebrow { margin: 0; }
.link-btn.small { padding: 5px 11px; font-size: 12.5px; }
.composer-view .seats { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.composer-view .seat-opt { background: var(--panel); }
.examples { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 26px; }
.example { border: 1px solid var(--line); background: transparent; border-radius: 999px; padding: 7px 14px; font-size: 13px; color: var(--ink2); }
.example:hover { background: var(--panel); border-color: var(--line-strong); }

/* ---------- an open debate: the question, then the answer ---------- */
.question { display: flex; justify-content: flex-end; margin: 4px 0 18px; }
.question .bubble { max-width: 78%; background: var(--bubble); color: var(--ink); border-radius: 20px 20px 6px 20px; padding: 12px 16px; font-size: 15px; line-height: 1.55; white-space: pre-wrap; }
.question .bubble small { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; margin-bottom: 4px; }
/* one line under the question: status, seats and time, then the actions */
.run-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 14px; margin: 0 0 26px; }
.run-bar .meta { flex: 1 1 auto; min-width: 0; }
.question .bubble .asked { white-space: pre-wrap; }
.bubble-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; white-space: normal; }
.bubble .file-chip { background: var(--panel); padding-right: 10px; }

@media (max-width: 920px) {
  .app { grid-template-columns: 1fr; }
  aside.sidebar { position: static; height: auto; }
  .history { max-height: 240px; }
  main { padding: 0 16px 70px; }
  .composer-view { min-height: 0; padding-top: 28px; }
  .hero-title { font-size: 34px; }
}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="#D97757" stroke-width="4" stroke-dasharray="24 100"/><circle cx="16" cy="16" r="12" fill="none" class="arc-ink" stroke-width="4" stroke-dasharray="24 100" stroke-dashoffset="-25.1"/><circle cx="16" cy="16" r="12" fill="none" stroke="#9B72CB" stroke-width="4" stroke-dasharray="24 100" stroke-dashoffset="-50.2"/></svg>
      <b>argue</b><span>debate desk</span>
    </div>
    <button class="new-btn" id="new-debate" type="button"><span aria-hidden="true">＋</span> New debate</button>

    <div class="history" id="runs"><p class="hint">Loading…</p></div>

    <div class="side-bottom">
      <div class="eyebrow">Plan usage</div>
      <div class="usage" id="usage"></div>
      <details class="library" id="library">
        <summary><span class="eyebrow">Saved debates</span><span class="lib-short" id="lib-short"></span></summary>
        <p class="hint">Each finished debate is saved as <b>report.pdf</b> (final answer), <b>report.html</b> (every round) and <b>debate.json</b> (to reopen or rerun it).</p>
        <div class="lib-path" id="lib-path">…</div>
        <div class="lib-actions">
          <button class="btn ghost small" id="lib-change" type="button">Change folder…</button>
          <button class="btn ghost small" id="lib-open" type="button">Open folder</button>
        </div>
      </details>
      <div class="theme-row">
        <span class="eyebrow">Theme</span>
        <div class="seg" id="theme-switch" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" data-theme-pick="light" title="Light"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Light</button>
          <button type="button" role="radio" data-theme-pick="dark" title="Dark"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 10.1A6 6 0 0 1 5.9 2.4a6 6 0 1 0 7.7 7.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>Dark</button>
          <button type="button" role="radio" data-theme-pick="system" title="Default: follow this computer's light or dark setting"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4Z" fill="currentColor"/></svg>Default</button>
        </div>
      </div>
      <div class="side-foot">
        <p class="hint">Runs only on this computer.</p>
        <button class="btn ghost small" id="quit" type="button">Quit</button>
      </div>
    </div>
  </aside>

  <main id="main">
    <div id="banner-slot"></div>

    <section class="composer-view" id="composer-view">
      <div class="hero">
        <svg class="hero-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="#D97757" stroke-width="2.6" stroke-dasharray="24 100" stroke-linecap="round"/><circle cx="16" cy="16" r="12" fill="none" class="arc-ink" stroke-width="2.6" stroke-dasharray="24 100" stroke-dashoffset="-25.1" stroke-linecap="round"/><circle cx="16" cy="16" r="12" fill="none" stroke="#9B72CB" stroke-width="2.6" stroke-dasharray="24 100" stroke-dashoffset="-50.2" stroke-linecap="round"/></svg>
        <h1 class="hero-title">What should they <em>debate</em>?</h1>
      </div>

      <div class="composer">
        <textarea id="task" rows="3" placeholder="Ask a question worth more than one opinion…"></textarea>
        <div class="attach-list" id="attach-list"></div>
        <div class="composer-bar">
          <input type="file" id="attach-input" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv" hidden>
          <button class="tool-btn" id="attach-btn" type="button" title="Attach PDFs, images or text files">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Attach</span>
          </button>
          <span id="rounds-pick"></span>
          <span id="agree-pick"></span>
          <span class="spacer"></span>
          <span class="kbd-hint" id="kbd-hint"></span>
          <button class="btn start" id="start" type="button">Start debate</button>
        </div>
      </div>
      <p class="err" id="form-error" hidden></p>

      <div class="seats-panel">
        <div class="seats-head">
          <span class="eyebrow">Seats at the table</span>
          <button class="link-btn small" id="add-seat" type="button"><svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>Scan for CLIs</button>
        </div>
        <div class="seats" id="seats"></div>
      </div>

      <div class="examples" id="examples">
        <button type="button" class="example">Monolith or microservices for a two-person startup?</button>
        <button type="button" class="example">Which first programming language should a beginner learn in 2026?</button>
        <button type="button" class="example">Should a small SaaS raise prices by 15% this year?</button>
      </div>
    </section>

    <section class="run-view" id="run-view" hidden></section>
  </main>
</div>
<script>
(function () {
  "use strict";
  var token = (new URLSearchParams(location.hash.slice(1))).get("t") || "";
  var PALETTE = ["#3d5bd9", "#0c8599", "#2f7d4a", "#ae3ec9", "#c2255c", "#e8590c"];
  // Shared seat themes (src/ui/themes.ts), injected by the server: same marks as reports and icons.
  var SEAT_THEMES = /*SEAT_THEMES*/[];
  var EFFORT_LABELS = /*EFFORT_LABELS*/{};
  function themeForSeat(model, cli) {
    var m = String(model || "").toLowerCase();
    for (var i = 0; m && i < SEAT_THEMES.length; i++) {
      if (SEAT_THEMES[i].models && new RegExp(SEAT_THEMES[i].models).test(m)) return SEAT_THEMES[i];
    }
    var c = String(cli || "").toLowerCase();
    for (var j = 0; j < SEAT_THEMES.length; j++) {
      if ((SEAT_THEMES[j].clis || []).indexOf(c) >= 0) return SEAT_THEMES[j];
    }
    return null;
  }
  var state = { config: null, runs: [], selected: null, cache: {}, pollTimer: null, closed: false, attachments: [] };

  function api(path, opts) {
    opts = opts || {};
    var headers = { "x-argue-token": token };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
        if (res.status === 401) { showStaleToken(); throw new Error("This page's access link is out of date."); }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data && data.error ? data.error : "HTTP " + res.status);
          return data;
        });
      });
  }

  // Safe DOM builder: strings become text nodes, never HTML.
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "style") el.setAttribute("style", v);
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else if (k === "text") el.textContent = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
  function svg(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]);
    return el;
  }

  // ---------- line icons: drawn in the text colour, so they match both themes (no emoji) ----------
  var ICONS = {
    file: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5"],
    text: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6", "M9 17h4"],
    image: ["M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m21 15-5-5L5 20", "M9 9h.01"],
    globe: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", "M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9", "M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9"],
    folder: ["M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"],
    save: ["M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"],
    again: ["M20 12a8 8 0 1 1-2.34-5.66", "M20 4v5h-5"],
    stop: ["M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"]
  };
  function icon(name) {
    var el = svg("svg", { viewBox: "0 0 24 24", class: "ico", "aria-hidden": "true" });
    ICONS[name].forEach(function (d) { el.appendChild(svg("path", { d: d })); });
    return el;
  }
  function fileKind(name) { return /\.pdf$/i.test(name) ? "file" : /\.(png|jpe?g|webp|gif)$/i.test(name) ? "image" : "text"; }

  // ---------- in-page dialogs and notices (the browser's own boxes ignore the desk's look) ----------
  // Resolves true/false, or the typed text (null when cancelled) when o.input is given.
  var dialogCount = 0;
  function ask(o) {
    return new Promise(function (resolve) {
      var id = "dlg" + (++dialogCount);
      var input = o.input ? h("input", { type: "text", value: o.input.value || "", placeholder: o.input.placeholder || "", "aria-label": o.title }) : null;
      var ok = h("button", { class: "btn" + (o.danger ? " danger" : ""), type: "button" }, o.confirm || "OK");
      var cancel = h("button", { class: "btn ghost", type: "button" }, o.cancel || "Cancel");
      var box = h("div", { class: "card modal dialog", role: "alertdialog", "aria-modal": "true", "aria-labelledby": id + "-t", "aria-describedby": o.message ? id + "-m" : null },
        h("h2", { id: id + "-t", text: o.title }),
        o.message ? h("p", { id: id + "-m", class: "dialog-text", text: o.message }) : null,
        input,
        h("div", { class: "actions" }, cancel, ok));
      var scrim = h("div", { class: "scrim" }, box);
      var before = document.activeElement;
      function done(value) {
        document.removeEventListener("keydown", onKey, true);
        scrim.remove();
        if (before && before.focus && document.contains(before)) before.focus();
        resolve(value);
      }
      var no = function () { done(input ? null : false); };
      var yes = function () { done(input ? input.value.trim() : true); };
      // Captured first, so Escape or Enter here never reaches a dialog underneath.
      function onKey(ev) {
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); no(); }
        else if (ev.key === "Enter" && ev.target === input) { ev.preventDefault(); ev.stopPropagation(); yes(); }
        else if (ev.key === "Tab") {
          var stops = [input, cancel, ok].filter(Boolean);
          var at = stops.indexOf(document.activeElement);
          ev.preventDefault();
          stops[(at + (ev.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
        }
      }
      ok.addEventListener("click", yes);
      cancel.addEventListener("click", no);
      scrim.addEventListener("mousedown", function (ev) { if (ev.target === scrim) no(); });
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(scrim);
      // Risky actions start on Cancel, so a stray Enter never confirms them.
      (input || (o.danger ? cancel : ok)).focus();
    });
  }
  // A short note at the bottom of the window that goes away by itself.
  function notify(message, kind) {
    var box = document.getElementById("toasts");
    if (!box) { box = h("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" }); document.body.appendChild(box); }
    var note = h("div", { class: "toast" + (kind ? " " + kind : "") }, h("span", { text: message }),
      h("button", { type: "button", class: "toast-x", "aria-label": "Dismiss", onclick: function () { note.remove(); } }, "×"));
    box.appendChild(note);
    setTimeout(function () { note.remove(); }, 8000);
  }

  // ---------- seat themes ----------
  function agentInfo(id) {
    return state.config ? state.config.agents.filter(function (a) { return a.id === id; })[0] : null;
  }
  // A seat's catalog key: its cliType, or for "text" seats the command it runs (e.g. "ollama").
  function seatKey(a) { return a.cliType === "text" ? (a.command || "text") : a.cliType; }
  // Seat cards follow the model picked now; a debate shows the model each seat ran with.
  function themeFor(id, seatCard) {
    var a = agentInfo(id);
    var used = !seatCard && state.runSeats && state.runSeats[id];
    var picked = seatCard && state.pickers && state.pickers[id] ? state.pickers[id].value().model : null;
    var model = used ? used.model : picked || (a && a.model);
    var t = model || a ? themeForSeat(model, used ? used.cli : a && seatKey(a)) : null;
    if (t) return paint(t);
    var ids = state.config ? state.config.agents.map(function (x) { return x.id; }) : [];
    var idx = Math.max(0, ids.indexOf(id));
    var color = PALETTE[idx % PALETTE.length];
    return paint({ name: id, color: color, soft: "#eef0f6", glyph: (id[0] || "?").toUpperCase() });
  }
  // Seat colours are tuned for the light page. On the dark page, near-black marks (ChatGPT, Grok…)
  // turn light and the pale tints become dark ones, so every seat stays readable.
  function hexRgb(hex) {
    var s = String(hex || "").replace("#", "");
    if (s.length === 3) s = s.replace(/./g, "$&$&");
    var n = parseInt(s, 16) || 0;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mixHex(a, b, w) {
    var x = hexRgb(a), y = hexRgb(b);
    return "#" + x.map(function (v, i) { return ("0" + Math.round(v * w + y[i] * (1 - w)).toString(16)).slice(-2); }).join("");
  }
  function paint(t) {
    if (!isDark()) return t;
    var rgb = hexRgb(t.color);
    var light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.3;
    var color = light ? "#e4dfd7" : t.color;
    return Object.assign({}, t, { color: color, soft: mixHex(color, "#221f1b", 0.2), tile: t.tile && light ? "#e4dfd7" : t.tile, ink: light ? "#181613" : "#fff" });
  }
  function themeVars(t) {
    return "--c:" + t.color + (t.gradient ? ";--g:linear-gradient(100deg," + t.gradient.join(",") + ")" : "");
  }
  // ChatGPT's mark: six rounded links turned 60 degrees apart (drawn, not a font glyph).
  function knot(color) {
    var g = svg("g", {});
    for (var k = 0; k < 6; k++) {
      g.appendChild(svg("rect", { x: 9.1, y: 2.6, width: 5.8, height: 12, rx: 2.9, fill: "none", stroke: color, "stroke-width": 1.7,
        transform: "rotate(" + (k * 60) + " 12 12)" }));
    }
    return g;
  }
  function markTheme(t) {
    if (t.knot) {
      return h("span", { class: "mark", style: "background:" + t.tile }, svg("svg", { viewBox: "0 0 24 24", width: 14, height: 14 }, knot(t.ink || "#fff")));
    }
    var style = t.gradient ? "background:linear-gradient(135deg," + t.gradient.join(",") + ");color:#fff"
      : "background:" + t.soft + ";color:" + t.color;
    return h("span", { class: "mark", style: style, text: t.glyph });
  }
  function mark(id) { return markTheme(themeFor(id)); }
  function seatMark(id) { return markTheme(themeFor(id, true)); }
  // "Opus 5.5 · High": the model and effort a seat used in the open debate (its settings when unknown).
  function seatUsedText(id) {
    var used = state.runSeats && state.runSeats[id];
    var a = agentInfo(id);
    var key = used ? used.cli : a && seatKey(a);
    var model = used ? used.model : a && a.model;
    if (!model) return "";
    var label = infoFor(key, canonical(key, model)).label || model;
    return label + (used && used.effort ? " · " + effortLabel(used.effort) : "");
  }

  var STATUS_LABEL = { consensus: "Consensus", partial_consensus: "Partial consensus", unresolved: "Unresolved", interrupted: "Interrupted",
    failed: "Failed", in_progress: "Running", running: "Running", stale: "No activity", stopped: "Stopped" };
  function statusPill(status) { return h("span", { class: "pill " + status }, h("span", { class: "dot" }), STATUS_LABEL[status] || status); }
  // Why a seat dropped out. "plan_limit: …" errors are its plan running out, in the CLI's own
  // words ("You've hit your session limit · resets 6:40pm").
  var PLAN_LIMIT = "plan_limit: ";
  function dropReason(reason, error) {
    var text = String(error || "").trim().replace(/^Error: /, "");
    if (text.indexOf(PLAN_LIMIT) === 0) return { limit: true, label: "plan limit reached", text: text.slice(PLAN_LIMIT.length) };
    var refused = claudeRefusal(text);
    if (refused) return { limit: true, label: "plan limit reached", text: refused };
    if (reason === "timeout" || /^__(round_)?timeout__$/.test(text)) return { limit: false, label: "did not answer in time", text: "" };
    return { limit: false, label: "dropped: error", text: text, summary: schemaComplaint(text) };
  }
  // Debates from before this version kept Claude's raw output: its own refusal is in there.
  function claudeRefusal(text) {
    if (text.indexOf('"is_error":true') < 0) return null;
    var lines = text.split(/\r?\n/);
    for (var i = lines.length - 1; i >= 0; i--) {
      var line = lines[i].replace(/^[^{]*stdout=(?=\{)/, "");
      if (line.charAt(0) !== "{" || line.indexOf('"is_error":true') < 0) continue;
      var event;
      try { event = JSON.parse(line); } catch (e) { continue; }
      if (event.type === "result" && (event.api_error_status === 429 || /limit|quota/i.test(String(event.result)))) return String(event.result);
    }
    return null;
  }
  // A schema complaint ([{ path, message }, ...]) as one readable sentence.
  function schemaComplaint(text) {
    if (text.charAt(0) !== "[") return null;
    var issues;
    try { issues = JSON.parse(text); } catch (e) { return null; }
    if (!Array.isArray(issues) || !issues.length || !issues[0] || !Array.isArray(issues[0].path)) return null;
    return "Its answer did not fit the expected format (" + issues[0].path.join(".") + ": " + issues[0].message +
      (issues.length > 1 ? ", and " + (issues.length - 1) + " more" : "") + ").";
  }
  // A plan limit reads as a sentence; any other error shows a one-line summary, the rest on request.
  function dropDetails(drop) {
    if (drop.limit) return h("p", { class: "limit-note", text: drop.text || "This seat's plan or quota ran out." });
    if (!drop.text) return h("p", { class: "limit-note", text: drop.label === "did not answer in time" ? "This seat did not answer in time." : "No details." });
    var first = drop.summary || drop.text.split(/\r?\n/)[0];
    var box = h("div", { class: "drop-error" }, h("p", { class: "limit-note", text: first.length > 180 ? first.slice(0, 180) + "…" : first }));
    if (first.length > 180 || drop.text.length > first.length) {
      box.appendChild(h("details", { class: "more" }, h("summary", { text: "Full error" }), h("p", { class: "mono prose", text: drop.text })));
    }
    return box;
  }
  function fmtElapsed(ms) {
    if (typeof ms !== "number") return "";
    var s = Math.round(ms / 1000);
    return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s";
  }
  function fmtWhen(requestId) {
    var m = /^argue_(\d+)/.exec(requestId);
    return m ? new Date(Number(m[1])).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : requestId;
  }

  // ---------- theme: Light, Dark, or Default (follow this computer's setting) ----------
  var darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function themePref() { var p = document.documentElement.getAttribute("data-theme-pref"); return p === "light" || p === "dark" ? p : "system"; }
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function applyTheme() {
    var pref = themePref();
    var dark = pref === "dark" || (pref === "system" && !!(darkQuery && darkQuery.matches));
    var changed = dark !== isDark();
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    [].forEach.call(document.querySelectorAll("[data-theme-pick]"), function (b) {
      b.setAttribute("aria-checked", String(b.getAttribute("data-theme-pick") === pref));
    });
    // Seat marks and usage rings carry inline colours: redraw them for the new background.
    if (changed) {
      renderSeats();
      Object.keys(pods).forEach(function (k) { pods[k].el.remove(); delete pods[k]; });
      loadUsage();
      if (state.selected) render();
    }
  }
  [].forEach.call(document.querySelectorAll("[data-theme-pick]"), function (b) {
    b.addEventListener("click", function () {
      var pick = b.getAttribute("data-theme-pick");
      document.documentElement.setAttribute("data-theme-pref", pick);
      applyTheme();
      // Saved in the workspace config: the desk opens on a new port each time, so the browser alone would forget.
      api("/api/desk/theme", { method: "POST", body: { theme: pick } }).catch(function (e) { showFormError("Could not save the theme: " + e.message); });
    });
  });
  if (darkQuery) {
    var onSystemTheme = function () { if (themePref() === "system") applyTheme(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSystemTheme); else darkQuery.addListener(onSystemTheme);
  }

  // ---------- CLI catalog: each seat's models, their names and effort levels ----------
  // Two passes, neither sends a prompt or spends tokens: a quick one (what is installed, the
  // built-in model lists) so the pickers show real names at once, then one that asks each CLI
  // for its own list (agy models, codex debug models).
  function scanClis(list, fresh) {
    var key = list ? "scanning" : "peeking";
    if (state[key]) return state[key];
    var p = api("/api/clis" + (list ? "?list=1" + (fresh ? "&fresh=1" : "") : "")).then(function (data) {
      // A quick pass that finishes after the full one must not replace it.
      if (list || !state.clisListed) {
        state.clis = {};
        data.clis.forEach(function (c) { state.clis[c.id] = c; });
        state.clisList = data.clis;
        if (list) state.clisListed = true;
        renderSeats();
      }
      return data;
    });
    state[key] = p;
    p.then(function () { state[key] = null; }, function () { state[key] = null; });
    return p;
  }
  function cliFor(key) { return (state.clis && state.clis[key]) || null; }
  // Aliases are shown as the model they stand for today (opus is Opus 5.5).
  function canonical(key, model) {
    var cli = cliFor(key);
    return (cli && cli.modelAliases && cli.modelAliases[model]) || model;
  }
  function infoFor(key, model) {
    var cli = cliFor(key);
    return (cli && cli.modelInfo && cli.modelInfo[model]) || {};
  }
  // The CLI's own list, in its order, with the seat's model added when the list lacks it.
  function modelOptionsFor(a) {
    var cli = cliFor(seatKey(a));
    var own = canonical(seatKey(a), a.model);
    var models = cli ? cli.models.slice() : [];
    if (models.indexOf(own) < 0) models.unshift(own);
    return models;
  }
  // A model the catalog lists with no levels (Haiku 4.5) has no effort setting.
  function effortOptionsFor(a, model) {
    if (a.effortInModel) return Object.keys(variantsFor(a).groups[model] || {}).filter(Boolean).sort(byEffort);
    var cli = cliFor(seatKey(a));
    if (!cli) return [];
    var byModel = cli.effortsByModel || {};
    return Object.prototype.hasOwnProperty.call(byModel, model) ? byModel[model] : (cli.efforts || []);
  }
  // Antigravity puts the effort in the model id (gemini-4-argon-high). The desk shows those as a
  // model (gemini-4-argon) plus an effort (high), the same pair every other seat has.
  var EFFORT_SUFFIX = /^(.+)-(minimal|low|medium|high|xhigh|max)$/;
  var EFFORT_RANK = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  var EFFORT_DETAIL = { minimal: "Fastest, least thinking", low: "Quick, light thinking", medium: "Balanced speed and depth",
    high: "Thinks harder", xhigh: "Thinks much harder", max: "Most thorough, slowest", ultra: "Beyond max" };
  function byEffort(x, y) { return EFFORT_RANK.indexOf(x) - EFFORT_RANK.indexOf(y); }
  function effortLabel(e) { return EFFORT_LABELS[e] || (e ? e.charAt(0).toUpperCase() + e.slice(1) : ""); }
  function splitModel(m) { var s = EFFORT_SUFFIX.exec(m); return s ? { base: s[1], effort: s[2] } : { base: m, effort: "" }; }
  // { order: [base…], groups: { base: { effort: modelId } } }; "" holds a model id with no effort suffix.
  function variantsFor(a) {
    var out = { order: [], groups: {} };
    modelOptionsFor(a).forEach(function (m) {
      var s = splitModel(m);
      if (!out.groups[s.base]) { out.groups[s.base] = {}; out.order.push(s.base); }
      out.groups[s.base][s.effort] = m;
    });
    return out;
  }
  // The model id to run. "Default" effort keeps the seat's own model when it is this one,
  // otherwise the middle level the CLI lists.
  function resolveVariant(a, base, effort) {
    var g = variantsFor(a).groups[base] || {};
    if (effort && g[effort]) return g[effort];
    if (splitModel(a.model).base === base) return a.model;
    return g[""] || g.medium || g[Object.keys(g).sort(byEffort)[0]] || base;
  }
  function modelItems(a) {
    var key = seatKey(a);
    if (a.effortInModel) {
      var v = variantsFor(a);
      return v.order.map(function (base) {
        var name = infoFor(key, v.groups[base][Object.keys(v.groups[base])[0]]).label;
        // "Gemini 4 Argon (High)" names one variant; the model picker names the model.
        return { value: base, text: name ? name.replace(/\s*\((minimal|low|medium|high|extra high|xhigh|max)\)\s*$/i, "") : base };
      });
    }
    return modelOptionsFor(a).map(function (m) {
      var info = infoFor(key, m);
      return { value: m, text: info.label || m, detail: info.detail, group: info.group };
    });
  }
  function defaultEffortText(a, model) {
    if (a.effortInModel) {
      var used = resolveVariant(a, model, "");
      var level = effortLabel(splitModel(used).effort);
      return used === a.model ? "This seat's setting" + (level ? ": " + level : "") : level || "The model's own level";
    }
    var cli = cliFor(seatKey(a));
    return "Use " + (cli ? cli.label : "the CLI") + "'s own setting";
  }
  // "Default" first (shown as "Effort" on the button), then only the levels this model accepts.
  function effortItems(a, model) {
    var levels = effortOptionsFor(a, model);
    if (!levels.length) return [];
    var details = a.effortInModel ? {} : infoFor(seatKey(a), model).effortDetails || {};
    return [{ value: "", text: "Default", detail: defaultEffortText(a, model) }].concat(levels.map(function (e) {
      return { value: e, text: effortLabel(e), detail: details[e] || EFFORT_DETAIL[e] };
    }));
  }
  // The model and effort last picked for a seat (kept in the workspace config by the server).
  function savedPick(a) {
    var p = (state.config.picks || {})[a.id] || {};
    var model = p.model ? canonical(seatKey(a), p.model) : "";
    var effort = p.effort || "";
    if (a.effortInModel && model) { var s = splitModel(model); model = s.base; effort = effort || s.effort; }
    return { model: model, effort: effort };
  }

  // ---------- dropdown: one look for every list on the desk, in both themes ----------
  // A select-only combobox (WAI-ARIA pattern): focus stays on it, the arrow keys move through
  // the list, Enter, Space or a click picks, and Escape, Tab or a click elsewhere closes it.
  // Options: label, items [{ value, text, detail, group }], value, placeholder (shown while the
  // value is ""), prefix (a fixed word inside the button, as in "Rounds 3"), pill, onChange.
  var openDropdown = null, dropdownCount = 0;
  function dropdown(o) {
    var id = "dd" + (++dropdownCount), items = [], value = "", active = -1;
    var text = h("span", { class: "dd-text" });
    var btn = h("div", { class: "dd-btn", role: "combobox", tabindex: "0", "aria-haspopup": "listbox", "aria-expanded": "false",
      "aria-controls": id + "-list", "aria-label": o.label }, o.prefix ? h("span", { class: "dd-prefix", text: o.prefix }) : null, text);
    var list = h("div", { class: "dd-list", role: "listbox", id: id + "-list", "aria-label": o.label, hidden: true });
    var self = { el: h("div", { class: "dd" + (o.pill ? " dd-pill" : "") }, btn, list), value: function () { return value; },
      setItems: setItems, setValue: function (v) { setItems(items, v); }, close: close, setTitle: function (t) { btn.title = t; } };
    // Clicks inside the list never take focus away from the button.
    list.addEventListener("mousedown", function (ev) { ev.preventDefault(); });

    function options() { return list.querySelectorAll(".dd-opt"); }
    function selected() { for (var i = 0; i < items.length; i++) if (items[i].value === value) return i; return -1; }
    function setItems(next, want) {
      items = next || [];
      value = items.some(function (it) { return it.value === want; }) ? want : o.placeholder || !items.length ? "" : items[0].value;
      list.textContent = "";
      var group = null;
      items.forEach(function (it, i) {
        if (it.group && it.group !== group) list.appendChild(h("div", { class: "dd-group", role: "presentation", text: it.group }));
        group = it.group || null;
        var opt = h("div", { class: "dd-opt", role: "option", id: id + "-o" + i },
          h("span", { class: "t", text: it.text }), it.detail ? h("span", { class: "d", text: it.detail }) : null);
        opt.addEventListener("click", function () { choose(i); });
        opt.addEventListener("mousemove", function () { if (active !== i) setActive(i); });
        list.appendChild(opt);
      });
      var off = !items.length;
      btn.setAttribute("aria-disabled", String(off));
      btn.tabIndex = off ? -1 : 0;
      if (off) close();
      sync();
    }
    function sync() {
      var i = selected();
      var placeholder = !!o.placeholder && value === "";
      text.textContent = placeholder ? o.placeholder : i >= 0 ? items[i].text : "";
      btn.classList.toggle("ph", placeholder);
      [].forEach.call(options(), function (el, k) { el.setAttribute("aria-selected", String(k === i)); });
    }
    function setActive(i) {
      var els = options();
      if (els[active]) els[active].classList.remove("active");
      active = i;
      var el = els[i];
      if (!el) { btn.removeAttribute("aria-activedescendant"); return; }
      el.classList.add("active");
      btn.setAttribute("aria-activedescendant", el.id);
      if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 4;
      else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
    }
    // The list floats above the page, so no card or dialog can cut it off: below the button, or
    // above it when there is more room there, and always inside the window.
    function place() {
      var b = btn.getBoundingClientRect();
      list.style.minWidth = b.width + "px";
      list.style.maxHeight = "";
      list.style.left = "0px";
      list.style.top = "0px";
      var natural = list.getBoundingClientRect();
      var below = window.innerHeight - b.bottom - 12, above = b.top - 12;
      var down = below >= Math.min(natural.height, 240) || below >= above;
      var room = Math.max(120, Math.min(320, down ? below : above));
      list.style.maxHeight = room + "px";
      list.style.top = (down ? b.bottom + 4 : b.top - 4 - Math.min(natural.height, room)) + "px";
      var left = b.left + natural.width > window.innerWidth - 8 ? b.right - natural.width : b.left;
      list.style.left = Math.max(8, left) + "px";
    }
    function open() {
      if (!items.length || openDropdown === self) return;
      if (openDropdown) openDropdown.close();
      openDropdown = self;
      list.hidden = false;
      self.el.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      place();
      setActive(Math.max(0, selected()));
      document.addEventListener("mousedown", onOutside, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", close);
    }
    // Focus leaving closes the list; so does a click anywhere else (even where focus cannot go),
    // scrolling the page under it, or resizing the window.
    function onOutside(ev) { if (!self.el.contains(ev.target)) close(); }
    function onScroll(ev) { if (ev.target !== list) close(); }
    function close() {
      if (openDropdown !== self) return;
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      openDropdown = null;
      list.hidden = true;
      self.el.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      setActive(-1);
      // A catalog scan that finished while this was open redraws the seats now.
      if (state.seatsStale) setTimeout(renderSeats, 0);
    }
    function choose(i) {
      var it = items[i];
      if (!it) return;
      var changed = it.value !== value;
      value = it.value;
      sync();
      close();
      if (changed && o.onChange) o.onChange(value);
    }
    btn.addEventListener("click", function () { if (openDropdown === self) close(); else open(); });
    btn.addEventListener("blur", close);
    btn.addEventListener("keydown", function (ev) {
      var k = ev.key;
      if (openDropdown !== self) {
        if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") { ev.preventDefault(); open(); }
        return;
      }
      if (k === "ArrowDown" || k === "ArrowUp") { ev.preventDefault(); setActive(Math.min(items.length - 1, Math.max(0, active + (k === "ArrowDown" ? 1 : -1)))); }
      else if (k === "Home" || k === "End") { ev.preventDefault(); setActive(k === "Home" ? 0 : items.length - 1); }
      else if (k === "Enter" || k === " ") { ev.preventDefault(); choose(active); }
      else if (k === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
      else if (k === "Tab") close();
    });
    setItems(o.items, o.value);
    return self;
  }

  // The composer's Rounds and Agree pickers: the same dropdown as the seats, so every list on
  // the desk follows the theme.
  var roundsDd = dropdown({ label: "Rounds", prefix: "Rounds", pill: true, value: "3",
    items: [1, 2, 3, 4, 5].map(function (n) { return { value: String(n), text: String(n) }; }),
    onChange: function () { state.roundsTouched = true; } });
  roundsDd.setTitle("How many rounds of cross-examination, at most");
  var agreeDd = dropdown({ label: "Agree", prefix: "Agree", pill: true, value: "1",
    items: [
      { value: "1", text: "Everyone", detail: "Every seat must accept a claim" },
      { value: "0.67", text: "Two-thirds", detail: "At least two thirds of the seats" },
      { value: "0.51", text: "Majority", detail: "More than half of the seats" }
    ],
    onChange: function () { state.thresholdTouched = true; } });
  agreeDd.setTitle("How many seats must accept a claim for it to count as agreed");
  document.getElementById("rounds-pick").replaceWith(roundsDd.el);
  document.getElementById("agree-pick").replaceWith(agreeDd.el);

  function loadConfig() {
    return api("/api/config").then(function (cfg) {
      state.config = cfg;
      renderSeats();
      if (cfg.defaults.maxRounds >= 1 && cfg.defaults.maxRounds <= 5 && !state.roundsTouched) roundsDd.setValue(String(cfg.defaults.maxRounds));
      var agree = ["1", "0.67", "0.51"].filter(function (v) { return Number(v) === cfg.defaults.threshold; })[0];
      if (agree && !state.thresholdTouched) agreeDd.setValue(agree);
    }).catch(function (e) { showFormError("Could not load config: " + e.message); });
  }

  // One card per seat: tick it to take part, and pick its model and effort for this debate.
  function renderSeats() {
    var cfg = state.config; if (!cfg) return;
    var box = document.getElementById("seats");
    // Never pull a list out from under the pointer: redraw once the open one closes.
    if (openDropdown && box.contains(openDropdown.el)) { state.seatsStale = true; return; }
    state.seatsStale = false;
    var prevChecked = {};
    [].forEach.call(box.querySelectorAll("input[type=checkbox]"), function (c) { prevChecked[c.value] = c.checked; });
    box.textContent = "";
    state.pickers = {};
    if (!cfg.agents.length) {
      box.appendChild(h("p", { class: "hint", text: "No seats yet. Click Scan for CLIs to find the AI tools installed on this computer." }));
      return;
    }
    cfg.agents.forEach(function (a) {
      var key = seatKey(a);
      var own = a.effortInModel ? splitModel(a.model).base : canonical(key, a.model);
      var pick = savedPick(a);
      var cb = h("input", { type: "checkbox", value: a.id });
      cb.checked = a.id in prevChecked ? prevChecked[a.id] : cfg.defaults.agents.indexOf(a.id) >= 0;
      var models = modelItems(a);
      var startModel = models.some(function (m) { return m.value === pick.model; }) ? pick.model : own;
      var modelDd = dropdown({ label: "Model for " + a.id, items: models, value: startModel, onChange: changed });
      var effortDd = dropdown({ label: "Effort for " + a.id, placeholder: "Effort", onChange: changed });
      // Fills the effort list for the chosen model, keeping the wanted level when that model has it.
      function refresh(wantEffort) {
        var model = modelDd.value();
        var items = effortItems(a, model);
        effortDd.setItems(items, wantEffort);
        var info = infoFor(key, model);
        modelDd.setTitle(a.effortInModel ? "Runs " + resolveVariant(a, model, effortDd.value())
          : "Model: " + (info.label ? info.label + " (" + model + ")" : model) + (info.detail ? ". " + info.detail : ""));
        var cli = cliFor(key);
        effortDd.setTitle(!items.length ? (!cli || (cli.canList && !state.clisListed) ? "Loading this model’s effort levels…" : "This model has no effort setting.")
          : effortDd.value() ? "Effort: " + effortLabel(effortDd.value()) : "Effort: not set. " + defaultEffortText(a, model) + ".");
      }
      // Saved in the workspace config: the desk opens on a new port each time, so the browser would forget.
      function changed() {
        refresh(effortDd.value());
        // The seat's mark follows its model (Antigravity can seat Claude, for one).
        var nextMark = seatMark(a.id);
        markEl.replaceWith(nextMark);
        markEl = nextMark;
        pick = { model: modelDd.value(), effort: effortDd.value() };
        cfg.picks = cfg.picks || {};
        cfg.picks[a.id] = pick;
        api("/api/desk/seat", { method: "POST", body: { id: a.id, model: pick.model === own ? "" : pick.model, effort: pick.effort } })
          .catch(function (e) { showFormError("Could not save the model and effort for " + a.id + ": " + e.message); });
      }
      refresh(pick.effort);
      state.pickers[a.id] = {
        // What this debate runs: Antigravity gets the full model id and no separate effort flag.
        value: function () {
          var model = modelDd.value(), effort = effortDd.value();
          return a.effortInModel ? { model: resolveVariant(a, model, effort), effort: "" } : { model: model, effort: effort };
        }
      };
      var markEl = seatMark(a.id);
      box.appendChild(h("div", { class: "seat-opt" },
        h("label", { class: "seat-main" }, cb, markEl, h("span", { text: a.id })),
        h("button", { class: "rm", type: "button", title: "Remove this seat", "aria-label": "Remove seat " + a.id,
          onclick: function (ev) { ev.preventDefault(); removeSeat(a.id); } }, "×"),
        h("div", { class: "seat-pick" }, modelDd.el, effortDd.el)));
    });
  }
  function removeSeat(id) {
    ask({ title: "Remove this seat?", message: "\u201c" + id + "\u201d leaves this workspace. Past debates keep their results.",
      confirm: "Remove seat", danger: true }).then(function (yes) {
      if (!yes) return;
      api("/api/seats/" + encodeURIComponent(id), { method: "DELETE" }).then(function () { return loadConfig().then(loadUsage); })
        .catch(function (e) { showFormError(e.message); });
    });
  }
  function showFormError(msg) {
    var el = document.getElementById("form-error");
    el.hidden = !msg; el.textContent = msg || "";
  }
  document.getElementById("start").addEventListener("click", function () {
    var btn = this;
    var agents = [].slice.call(document.querySelectorAll("#seats input:checked")).map(function (c) { return c.value; });
    var task = document.getElementById("task").value.trim();
    if (!task) return showFormError("Write a task for the debate first.");
    if (agents.length < 2) return showFormError("Pick at least two seats.");
    var settings = {};
    agents.forEach(function (id) {
      var p = state.pickers[id];
      if (p) settings[id] = p.value();
    });
    showFormError("");
    btn.disabled = true; btn.textContent = state.attachments.length ? "Uploading files…" : "Starting…";
    readAttachments().then(function (files) {
      btn.textContent = "Starting…";
      return api("/api/runs", { method: "POST", body: {
        task: task, agents: agents, settings: settings, attachments: files,
        maxRounds: Number(roundsDd.value()),
        threshold: Number(agreeDd.value())
      } });
    }).then(function (res) {
      document.getElementById("task").value = "";
      state.attachments = []; renderAttachments();
      return refreshRuns().then(function () { select(res.requestId); });
    }).catch(function (e) { showFormError(e.message); })
      .then(function () { btn.disabled = false; btn.textContent = "Start debate"; });
  });

  // ---------- attachments (PDFs, images, text) ----------
  var MAX_FILES = 10, MAX_FILE_BYTES = 25 * 1024 * 1024;
  document.getElementById("attach-btn").addEventListener("click", function () { document.getElementById("attach-input").click(); });
  document.getElementById("attach-input").addEventListener("change", function () {
    var input = this;
    [].slice.call(input.files || []).forEach(function (file) {
      if (state.attachments.length >= MAX_FILES) return showFormError("Attach at most " + MAX_FILES + " files.");
      if (file.size > MAX_FILE_BYTES) return showFormError(file.name + " is larger than 25 MB.");
      state.attachments.push(file);
    });
    input.value = "";
    renderAttachments();
  });
  function renderAttachments() {
    var box = document.getElementById("attach-list");
    box.textContent = "";
    state.attachments.forEach(function (file, i) {
      box.appendChild(fileChip(file.name,
        h("button", { type: "button", "aria-label": "Remove " + file.name, onclick: function () { state.attachments.splice(i, 1); renderAttachments(); } }, "×")));
    });
  }
  // An attached file: its kind's icon and its name (plus a remove button while composing).
  function fileChip(name, extra) {
    return h("span", { class: "file-chip", title: name }, icon(fileKind(name)), h("span", { text: name }), extra || null);
  }
  // Files go up as base64 in the start request and are saved next to the run, on this computer.
  function readAttachments() {
    return Promise.all(state.attachments.map(function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { var url = String(reader.result); resolve({ name: file.name, data: url.slice(url.indexOf(",") + 1) }); };
        reader.onerror = function () { reject(new Error("Could not read " + file.name)); };
        reader.readAsDataURL(file);
      });
    }));
  }

  // ---------- library (where finished debates are saved) ----------
  function loadLibrary() {
    return api("/api/library").then(function (lib) {
      var el = document.getElementById("lib-path");
      var short = document.getElementById("lib-short");
      short.textContent = String(lib.dir).split(/[\\/]/).filter(Boolean).pop() || lib.dir; short.title = lib.dir;
      el.textContent = lib.dir; el.title = lib.dir + (lib.pdf ? "" : "  (no Edge/Chrome found: PDFs are skipped; open report.html and print it)");
      state.canPrintPdf = !!lib.pdf;
    }).catch(function () {});
  }
  document.getElementById("lib-change").addEventListener("click", function () {
    var btn = this; btn.disabled = true; btn.textContent = "Choose in the dialog…";
    api("/api/library/choose", { method: "POST" }).then(function (res) {
      if (res.cancelled) return;
      return loadLibrary();
    }).catch(function () {
      // No folder picker on this system: let the user type a path instead.
      return ask({ title: "Folder for saved debates", message: "Type the full path of the folder to save finished debates in.",
        input: { value: document.getElementById("lib-path").textContent || "", placeholder: "D:\\Debates" }, confirm: "Use this folder" })
        .then(function (typed) {
          if (!typed) return;
          return api("/api/library/dir", { method: "POST", body: { dir: typed } }).then(loadLibrary)
            .catch(function (e) { notify(e.message, "error"); });
        });
    }).then(function () { btn.disabled = false; btn.textContent = "Change folder…"; });
  });
  document.getElementById("lib-open").addEventListener("click", function () {
    api("/api/library/open", { method: "POST" }).catch(function (e) { notify(e.message, "error"); });
  });

  // ---------- scan for CLIs / connect one ----------
  function seatNameFor(cliType) {
    var base = cliType === "text" ? "custom" : cliType === "codex" ? "chatgpt" : cliType === "antigravity" ? "gemini" : cliType;
    var taken = state.config.agents.map(function (a) { return a.id; });
    var name = base; var n = 2;
    while (taken.indexOf(name) >= 0) name = base + "-" + n++;
    return name;
  }
  // Catalog presets send only their id; the server fills in the preset's safe flags itself.
  function presetBody(cli, id, model) {
    var body = cli.cliType === "text" && cli.id ? { id: id, preset: cli.id, model: model } : { id: id, cliType: cli.cliType, model: model };
    if (cli.path) body.command = cli.path;
    return body;
  }
  function addSeat(body) {
    return api("/api/seats", { method: "POST", body: body }).then(function () { return loadConfig().then(loadUsage); });
  }
  document.getElementById("add-seat").addEventListener("click", openScan);
  function openScan() {
    var chosen = null;
    var nameInput = h("input", { type: "text", placeholder: "e.g. claude-sonnet" });
    // Known models in the desk's own dropdown; "Other model id…" (or a CLI with no list) types one in.
    var OTHER = "…other";
    var modelDd = dropdown({ label: "Model", items: [], onChange: syncModelInput });
    var modelInput = h("input", { type: "text", placeholder: "model id", "aria-label": "Model id" });
    function syncModelInput() { modelInput.hidden = !modelDd.el.hidden && modelDd.value() !== OTHER; }
    var cmdInput = h("input", { type: "text", placeholder: "command, e.g. mycli or C:\\tools\\mycli.exe" });
    var argsInput = h("input", { type: "text", placeholder: "flags, e.g. --print --model {providerModel}" });
    var custom = h("div", { style: "display:none;gap:12px", class: "custom-fields" },
      h("label", { class: "field" }, "Command", cmdInput),
      h("label", { class: "field" }, "Flags (space-separated)", argsInput,
        h("span", { class: "hint", text: "argue sends the prompt on stdin. Use {providerModel} for the model, or {prompt} if the CLI only takes the prompt as an argument." })));
    var form = h("div", { style: "display:none;gap:12px" },
      h("label", { class: "field" }, "Seat name", nameInput),
      h("div", { class: "field" }, h("span", { text: "Model" }), modelDd.el, modelInput),
      custom);
    var err = h("p", { class: "err", hidden: true });
    var list = h("div", { class: "cli-list" }, h("p", { class: "waiting" }, h("span", { class: "dot" }), "Scanning this computer for AI CLIs… (asks each one for its model list: no prompts, no tokens)"));
    var save = h("button", { class: "btn", disabled: true }, "Add seat");
    var rescan = h("button", { class: "btn ghost small", type: "button" }, "Scan again");
    var scrim = h("div", { class: "scrim", onclick: function (ev) { if (ev.target === scrim) close(); } },
      h("div", { class: "card modal", role: "dialog", "aria-modal": "true", "aria-label": "Scan for CLIs" },
        h("div", { class: "section-head" }, h("h2", { text: "AI CLIs on this computer", style: "margin:0 auto 0 0" }), rescan),
        h("p", { class: "hint", text: "Every agent CLI found here can take a seat. Add one in a click, or select it to choose the model and name yourself." }),
        list, form, err,
        h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: close }, "Close"), save)));
    document.body.appendChild(scrim);
    function close() { scrim.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(ev) { if (ev.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);

    function pick(cli, btn) {
      chosen = cli;
      [].forEach.call(list.querySelectorAll(".cli-opt"), function (b) { b.classList.remove("sel"); });
      btn.classList.add("sel");
      form.style.display = "grid";
      custom.style.display = cli.cliType === "text" ? "grid" : "none";
      var items = (cli.models || []).map(function (m) {
        var info = (cli.modelInfo || {})[m] || {};
        return { value: m, text: info.label || m, detail: info.label ? m + (info.detail ? " · " + info.detail : "") : info.detail, group: info.group };
      });
      if (items.length) items.push({ value: OTHER, text: "Other model id…", detail: cli.modelHint || "Type any id this CLI accepts" });
      modelDd.setItems(items, items.length ? items[0].value : "");
      modelDd.el.hidden = !items.length;
      modelInput.value = "";
      modelInput.placeholder = cli.modelHint || "model id";
      syncModelInput();
      if (!nameInput.value || nameInput.dataset.auto) { nameInput.value = seatNameFor(cli.cliType === "text" && cli.id ? cli.id : cli.cliType); nameInput.dataset.auto = "1"; }
      save.disabled = false;
    }
    nameInput.addEventListener("input", function () { delete nameInput.dataset.auto; });

    function draw(data) {
      list.textContent = "";
      var installed = data.clis.filter(function (c) { return c.installed; });
      if (!installed.length) list.appendChild(h("p", { class: "hint", text: "No known AI CLIs found. Install one below, or use Other CLI for any command-line AI." }));
      installed.forEach(function (cli) {
        var t = paint(themeForSeat(cli.models && cli.models[0], cli.id) || { glyph: cli.label[0], color: "#555", soft: "#eee" });
        var seated = state.config.agents.filter(function (a) { return seatKey(a) === cli.id; }).map(function (a) { return a.id; });
        var quick = h("button", { class: "btn small pick", type: "button" }, seated.length ? "Add another" : "Add");
        quick.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var label = quick.textContent;
          quick.disabled = true; quick.textContent = "Adding…";
          approveUnrestricted(cli).then(function (yes) {
            if (!yes) { quick.disabled = false; quick.textContent = label; return; }
            var body = presetBody(cli, seatNameFor(cli.cliType === "text" ? cli.id : cli.cliType), (cli.models && cli.models[0]) || "default");
            return addSeat(body).then(function () { draw(state.lastScan); });
          }).catch(function (e) { err.hidden = false; err.textContent = e.message; quick.disabled = false; quick.textContent = label; });
        });
        var b = h("div", { class: "cli-opt", role: "button", tabindex: "0" },
          markTheme(t),
          h("span", { style: "min-width:0" }, cli.label,
            h("small", { text: (cli.models.length ? cli.models.length + " models" : "models: " + (cli.modelHint || "type one in")) + (seated.length ? " · seated as " + seated.join(", ") : "") })),
          cli.unrestricted ? h("span", { class: "pill disagree", title: cli.unrestricted, text: "can act on its own" }) :
            cli.note ? h("span", { class: "pill revise", title: cli.note, text: "note" }) : null,
          cli.unverified ? h("span", { class: "pill", title: "Set up from this CLI's documentation; argue has not run it on a real install yet. If it fails, check its --help.", text: "untested" }) : null,
          quick);
        onActivate(b, function () { pick(cli, b); });
        list.appendChild(b);
      });
      var other = h("div", { class: "cli-opt", role: "button", tabindex: "0" }, h("span", { class: "mark", style: "background:var(--soft)", text: "+" }),
        h("span", null, "Other CLI", h("small", { text: "Any command that reads a prompt and prints an answer" })));
      onActivate(other, function () { pick({ cliType: "text", models: [] }, other); });
      list.appendChild(other);
      var missing = data.clis.filter(function (c) { return !c.installed; });
      if (missing.length) {
        var d = h("details", { class: "more", style: "margin-top:6px" }, h("summary", { text: "Not installed (" + missing.length + ")" }));
        missing.forEach(function (c) { d.appendChild(h("p", { class: "hint", style: "margin-top:6px" }, h("b", { text: c.label + ": " }), c.install)); });
        list.appendChild(d);
      }
    }
    function run(fresh) {
      scanClis(true, fresh).then(function (data) { state.lastScan = data; draw(data); })
        .catch(function (e) { list.textContent = ""; list.appendChild(h("p", { class: "err", text: e.message })); });
    }
    rescan.addEventListener("click", function () { run(true); });
    run(false);

    save.addEventListener("click", function () {
      if (!chosen) return;
      err.hidden = true;
      var cli = chosen;
      approveUnrestricted(cli).then(function (yes) {
        if (!yes) return;
        var typed = modelDd.el.hidden || modelDd.value() === OTHER;
        var body = presetBody(cli, nameInput.value.trim(), typed ? modelInput.value.trim() : modelDd.value());
        if (cli.cliType === "text" && !cli.id) {
          body.command = cmdInput.value.trim();
          body.args = argsInput.value.trim() ? argsInput.value.trim().split(/\s+/) : [];
        }
        save.disabled = true;
        return addSeat(body).then(close);
      }).catch(function (e) { err.hidden = false; err.textContent = e.message; save.disabled = false; });
    });
  }
  // CLIs that approve their own tool use (Kimi, Mistral Vibe) are only added after a warning.
  function approveUnrestricted(cli) {
    if (!cli.unrestricted) return Promise.resolve(true);
    return ask({ title: "Add " + cli.label + "?", message: cli.unrestricted, confirm: "Add anyway", danger: true });
  }
  // Click, Enter or Space: for the role="button" rows that are not real buttons.
  function onActivate(el, fn) {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", function (ev) {
      if (ev.target === el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); fn(); }
    });
  }

  // ---------- run list ----------
  function runStatus(run) {
    if (run.process && run.process.state === "exited" && run.status === "in_progress") return run.process.exitCode === 0 ? "in_progress" : "stopped";
    return run.status;
  }
  function refreshRuns() {
    return api("/api/runs").then(function (data) {
      state.runs = data.runs;
      // Redrawn only when something changed, so hover and keyboard focus survive the 5-second refresh.
      var drawn = JSON.stringify(data.runs) + "|" + state.selected + "|" + new Date().toDateString();
      if (drawn === state.runsDrawn) return;
      state.runsDrawn = drawn;
      var box = document.getElementById("runs");
      box.textContent = "";
      if (data.runs.length === 0) box.appendChild(h("p", { class: "hint", style: "padding:0 8px", text: "Your debates will appear here." }));
      // Grouped like a chat history: Today, Yesterday, Earlier.
      var lastGroup = null;
      data.runs.forEach(function (run) {
        var group = dayGroup(run.requestId);
        if (group !== lastGroup) { box.appendChild(h("div", { class: "group", text: group })); lastGroup = group; }
        var cached = state.cache[run.requestId];
        var title = run.title || stripAttachmentNote(run.prompt || (run.process && run.process.task) || (cached && cached.model.task) || "") || "Debate in progress";
        box.appendChild(h("button", { class: "run-item" + (state.selected === run.requestId ? " active" : ""), title: title, onclick: function () { select(run.requestId); } },
          h("span", { class: "t", text: title }),
          h("span", { class: "m" }, statusPill(runStatus(run)), fmtWhen(run.requestId), run.saved ? " · saved" : "")));
      });
      document.getElementById("new-debate").classList.toggle("active", !state.selected);
    }).catch(function () {});
  }
  function dayGroup(requestId) {
    var m = /^argue_(\d+)/.exec(requestId);
    if (!m) return "Earlier";
    var d = new Date(Number(m[1])); var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (d.getTime() >= start) return "Today";
    if (d.getTime() >= start - 86400000) return "Yesterday";
    if (d.getTime() >= start - 6 * 86400000) return "This week";
    return "Earlier";
  }
  function stripAttachmentNote(text) {
    return String(text || "").replace(/\n\nAttached files \(read them as part of the task\):[\s\S]*$/, "");
  }

  // ---------- switching views: new debate vs an open one ----------
  function showView(name) {
    document.getElementById("composer-view").hidden = name !== "composer";
    document.getElementById("run-view").hidden = name !== "run";
    window.scrollTo(0, 0);
  }
  function showComposer() {
    clearTimeout(state.pollTimer);
    state.selected = null;
    state.runSeats = null;
    showView("composer");
    refreshRuns();
    document.getElementById("task").focus();
  }
  document.getElementById("new-debate").addEventListener("click", showComposer);

  // ---------- selected run ----------
  function select(requestId) {
    state.selected = requestId;
    if (!state.cache[requestId]) state.cache[requestId] = { events: [], nextSeq: 0, result: null, error: null, process: null, model: emptyModel() };
    state.cache[requestId].drawn = null;
    showView("run");
    document.getElementById("run-view").textContent = "";
    refreshRuns();
    poll();
  }
  var USAGE_EVENTS = { ParticipantResponded: 1, RoundCompleted: 1, ReportCompleted: 1, Finalized: 1 };
  function poll() {
    clearTimeout(state.pollTimer);
    var id = state.selected;
    if (!id || state.closed) return;
    var c = state.cache[id];
    api("/api/runs/" + encodeURIComponent(id) + "?since=" + c.nextSeq).then(function (data) {
      if (state.selected !== id) return;
      var refreshUsage = false;
      data.events.forEach(function (e) {
        c.events.push(e); c.nextSeq = Math.max(c.nextSeq, e.seq + 1);
        if (e.event && USAGE_EVENTS[e.event.type]) refreshUsage = true;
      });
      // A seat just answered: its plan usage changed, so refresh the rings now.
      if (refreshUsage && c.events.length > data.events.length) loadUsage();
      c.result = data.result; c.error = data.error; c.process = data.process;
      c.saved = data.saved; c.attachments = data.attachments || []; c.seats = data.seats || null;
      // Redrawn only when something changed, so text stays selectable while a debate runs.
      var run = state.runs.filter(function (r) { return r.requestId === id; })[0];
      var drawn = [c.nextSeq, !!c.result, JSON.stringify(c.error), JSON.stringify(c.process), JSON.stringify(c.saved),
        c.attachments.join("/"), JSON.stringify(c.seats), run ? runStatus(run) : ""].join("|");
      if (drawn !== c.drawn) {
        c.drawn = drawn;
        c.model = buildModel(c.events, c.result);
        render();
      }
      if (!isDone(c)) state.pollTimer = setTimeout(poll, 1500);
      else {
        refreshRuns(); loadUsage();
        // The desk saves a finished debate to the library a moment after it ends, then prints its
        // PDF a few seconds later; keep looking until both are there.
        var waitingForSave = !c.saved || (state.canPrintPdf && !c.saved.hasPdf);
        if (c.result && waitingForSave && c.process && c.process.exitCode === 0 && (c.saveChecks = (c.saveChecks || 0) + 1) <= 10) {
          state.pollTimer = setTimeout(poll, 2000);
        }
      }
    }).catch(function () { if (!state.closed) state.pollTimer = setTimeout(poll, 3000); });
  }
  function isDone(c) {
    if (c.result || c.error) return true;
    if (c.model.finalized || c.model.failed) return true;
    return c.process && c.process.state === "exited";
  }

  function emptyModel() {
    return { participants: [], task: null, rounds: {}, roundOrder: [], claims: {}, merges: [], eliminated: {}, finalized: null, failed: null, interrupted: null, report: null };
  }

  // Fold the event log into rounds, lanes and a claim catalog.
  function buildModel(events, result) {
    var m = emptyModel();
    events.forEach(function (rec) {
      var e = rec.event || {}; var p = e.payload || {};
      switch (e.type) {
        case "SessionStarted": m.participants = p.participants || []; break;
        case "RoundDispatched":
          m.rounds[p.round] = m.rounds[p.round] || { round: p.round, phase: p.phase, participants: p.participants || [], responses: {}, completed: null, merges: [] };
          if (m.roundOrder.indexOf(p.round) < 0) m.roundOrder.push(p.round);
          break;
        case "ParticipantResponded": {
          var r = m.rounds[p.round]; if (!r) break;
          r.responses[p.participantId] = p;
          (p.extractedClaimsDetail || []).forEach(function (claim, i) {
            var id = p.participantId + ":" + p.round + ":" + i;
            m.claims[id] = { id: id, title: claim.title, statement: claim.statement, category: claim.category, by: p.participantId, round: p.round };
          });
          break;
        }
        case "ParticipantEliminated": {
          m.eliminated[p.participantId] = { round: p.round, reason: p.reason, error: p.error };
          var rr = m.rounds[p.round]; if (rr) rr.responses[p.participantId] = { eliminated: true, reason: p.reason, error: p.error };
          break;
        }
        case "ClaimsMerged": {
          var mr = m.rounds[p.round]; var merge = { from: p.sourceClaimId, into: p.mergedInto };
          if (mr) mr.merges.push(merge); m.merges.push(merge);
          break;
        }
        case "RoundCompleted": if (m.rounds[p.round]) m.rounds[p.round].completed = p; break;
        case "ReportDispatched": m.report = { reporterId: p.reporterId, done: false }; break;
        case "ReportCompleted": if (m.report) m.report.done = true; break;
        case "SessionInterrupted": m.interrupted = p; break;
        case "Finalized": m.finalized = p; break;
        case "Failed": m.failed = p; break;
      }
    });
    // A saved debate reopened from the library has no event log: rebuild the rounds from result.json.
    if (!events.length && result && Array.isArray(result.rounds)) {
      m.participants = (result.scoreboard || []).map(function (s) { return s.participantId; });
      result.rounds.forEach(function (rd) {
        var outs = rd.outputs || [];
        var r = { round: rd.round, phase: outs[0] ? outs[0].phase : "debate", participants: outs.map(function (o) { return o.participantId; }),
          responses: {}, completed: null, merges: (rd.appliedMerges || []).map(function (mg) { return { from: mg.sourceClaimId, into: mg.targetClaimId }; }) };
        outs.forEach(function (o) {
          r.responses[o.participantId] = { summary: o.summary, fullResponse: o.fullResponse, extractedClaimsDetail: o.extractedClaims || [],
            judgementsDetail: o.judgements || [], claimVotesDetail: o.claimVotes || [] };
          (o.extractedClaims || []).forEach(function (claim, i) {
            var id = o.participantId + ":" + rd.round + ":" + i;
            m.claims[id] = { id: id, title: claim.title, statement: claim.statement, category: claim.category, by: o.participantId, round: rd.round };
          });
        });
        m.rounds[rd.round] = r;
        m.roundOrder.push(rd.round);
        r.merges.forEach(function (mg) { m.merges.push(mg); });
      });
      m.finalized = { status: result.status };
      (result.eliminations || []).forEach(function (el) { m.eliminated[el.participantId] = { round: el.round, reason: el.reason, error: el.error }; });
    }
    if (result && result.task) m.task = result.task.prompt;
    if (result && result.finalClaims) result.finalClaims.forEach(function (fc) {
      var existing = m.claims[fc.claimId] || {};
      m.claims[fc.claimId] = Object.assign({}, existing, { id: fc.claimId, title: fc.title || existing.title, finalStatement: fc.statement, status: fc.status, mergedInto: fc.mergedInto, proposedBy: fc.proposedBy });
    });
    return m;
  }

  function claimLabel(model, id) {
    var c = model.claims[id];
    return c && c.title ? c.title : id;
  }

  function phaseName(r) {
    if (r.phase === "initial") return ["Opening proposals", "Each seat answers on its own, without seeing the others."];
    if (r.phase === "final_vote") return ["Final vote", "Each seat accepts or rejects every surviving claim."];
    return ["Cross-examination", "Each seat judges the others' claims: agree, disagree or revise."];
  }

  // ---------- rendering ----------
  function render() {
    var c = state.cache[state.selected]; if (!c) return;
    var m = c.model; var result = c.result;
    // The model and effort each seat ran with, for its marks and labels.
    state.runSeats = null;
    if (c.seats) { state.runSeats = {}; c.seats.forEach(function (seat) { state.runSeats[seat.id] = seat; }); }
    // The open debate draws into its own section; the "new debate" composer stays intact beside it.
    var main = document.getElementById("run-view");
    var scrollY = window.scrollY;
    var openDetails = {};
    [].forEach.call(main.querySelectorAll("details[data-key]"), function (d) { openDetails[d.getAttribute("data-key")] = d.open; });
    main.textContent = "";

    var run = state.runs.filter(function (r) { return r.requestId === state.selected; })[0];
    var status = result ? result.status : m.failed || c.error ? "failed" : run ? runStatus(run) : "in_progress";
    var running = c.process && c.process.state === "running";
    var asked = stripAttachmentNote((result && result.task && result.task.prompt) || (c.process && c.process.task) || (run && run.prompt) || "");
    var files = c.attachments || [];

    // Like a chat: your question (with its files) once, one line of status and actions, then the answer.
    if (asked || files.length) {
      main.appendChild(h("div", { class: "question" }, h("div", { class: "bubble" }, h("small", { text: "You asked" }),
        asked ? h("div", { class: "asked", text: asked }) : null,
        files.length ? h("div", { class: "bubble-files" }, files.map(function (name) { return fileChip(name); })) : null)));
    }
    main.appendChild(h("div", { class: "run-bar" },
      h("div", { class: "meta" }, statusPill(status),
        m.participants.map(function (id) {
          var out = m.eliminated[id] ? dropReason(m.eliminated[id].reason, m.eliminated[id].error) : null;
          return h("span", { class: "chip", title: seatUsedText(id) + (out ? " · " + out.label : "") }, mark(id), id, out ? (out.limit ? " (limit)" : " (out)") : "");
        }),
        result && result.metrics ? h("span", { text: fmtElapsed(result.metrics.elapsedMs) + " · " + result.metrics.totalRounds + " rounds" }) : null,
        h("span", { text: fmtWhen(state.selected) })),
      running ? h("div", { class: "run-actions" }, h("button", { class: "btn danger small", onclick: stopRun }, icon("stop"), "Stop debate")) : null,
      result ? renderRunActions(c, result) : null));

    if (result) main.appendChild(renderVerdict(result, m, openDetails));
    if (c.error || m.failed) main.appendChild(h("div", { class: "card verdict failed" },
      h("b", { text: "The run failed" }), h("p", { class: "mono prose", text: JSON.stringify((c.error && (c.error.error || c.error)) || m.failed, null, 2) })));
    if (c.process && c.process.state === "exited" && c.process.exitCode !== 0 && !result && c.process.stderrTail.length)
      main.appendChild(h("div", { class: "card verdict failed", style: "margin-top:12px" }, h("b", { text: "Process output" }), h("p", { class: "mono prose", text: c.process.stderrTail.join("\n") })));

    // Results first; the debate itself stays folded until opened.
    if (result) {
      main.appendChild(renderClaims(result, m));
      main.appendChild(renderScores(result));
    }

    var tl = h("div", { class: "section" },
      h("div", { class: "section-head" }, h("h3", { text: result ? "How they got there" : "The debate so far" }),
        m.roundOrder.length ? h("button", { class: "btn ghost small", onclick: function () { setAllRounds(true); } }, "Expand all") : null,
        m.roundOrder.length ? h("button", { class: "btn ghost small", onclick: function () { setAllRounds(false); } }, "Collapse all") : null),
      h("p", { class: "hint", style: "margin:-4px 0 12px", text: "Open a round to read each seat's answer, claims, judgements and reasoning." }));
    if (m.roundOrder.length === 0) tl.appendChild(h("p", { class: "waiting" }, h("span", { class: "dot" }), "Waiting for the first round to start…"));
    m.roundOrder.forEach(function (n) { tl.appendChild(renderRound(m.rounds[n], m, openDetails)); });
    if (m.report && !result) tl.appendChild(h("p", { class: "waiting" }, h("span", { class: "dot" }), m.report.reporterId + " is writing the final report…"));
    main.appendChild(tl);
    window.scrollTo(0, scrollY);
  }

  // Saved-debate actions: open the PDF / report / folder with the OS, save now, or run it again.
  function renderRunActions(c, result) {
    var id = state.selected;
    function open(what) { api("/api/runs/" + encodeURIComponent(id) + "/open", { method: "POST", body: { what: what } }).catch(function (e) { notify(e.message, "error"); }); }
    var bar = h("div", { class: "run-actions" });
    if (c.saved) {
      if (c.saved.hasPdf) bar.appendChild(h("button", { class: "btn ghost small", onclick: function () { open("pdf"); } }, icon("file"), "Open PDF"));
      bar.appendChild(h("button", { class: "btn ghost small", onclick: function () { open("html"); } }, icon("globe"), "Open report"));
      bar.appendChild(h("button", { class: "btn ghost small", onclick: function () { open("folder"); } }, icon("folder"), "Show in folder"));
    } else {
      var saveLabel = h("span", { text: "Save to library" });
      var save = h("button", { class: "btn ghost small" }, icon("save"), saveLabel);
      save.addEventListener("click", function () {
        save.disabled = true; saveLabel.textContent = "Saving…";
        api("/api/runs/" + encodeURIComponent(id) + "/save", { method: "POST" }).then(function () { c.saveChecks = 0; poll(); })
          .catch(function (e) { notify(e.message, "error"); save.disabled = false; saveLabel.textContent = "Save to library"; });
      });
      bar.appendChild(save);
    }
    bar.appendChild(h("button", { class: "btn ghost small", onclick: function () { runAgain(result); } }, icon("again"), "Run again"));
    return bar;
  }
  // Puts the same question and seats back in the form so the debate can be rerun or tweaked.
  function runAgain(result) {
    var prompt = result.task && result.task.prompt ? result.task.prompt : "";
    showComposer();
    document.getElementById("task").value = stripAttachmentNote(prompt);
    growTask();
    var ids = (result.scoreboard || []).map(function (s) { return s.participantId; });
    [].forEach.call(document.querySelectorAll("#seats input[type=checkbox]"), function (cb) { cb.checked = ids.indexOf(cb.value) >= 0; });
    showFormError(ids.some(function (sid) { return !agentInfo(sid); }) ? "Some seats from that debate are no longer set up; pick others." : "");
  }

  // ---------- composer niceties ----------
  var taskBox = document.getElementById("task");
  function growTask() {
    taskBox.style.height = "auto";
    taskBox.style.height = Math.min(340, Math.max(84, taskBox.scrollHeight)) + "px";
  }
  taskBox.addEventListener("input", growTask);
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  document.getElementById("kbd-hint").textContent = isMac ? "⌘ ↵" : "Ctrl ↵";
  taskBox.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); document.getElementById("start").click(); }
  });
  [].forEach.call(document.querySelectorAll(".example"), function (b) {
    b.addEventListener("click", function () { taskBox.value = b.textContent; growTask(); taskBox.focus(); });
  });

  function setAllRounds(open) {
    [].forEach.call(document.querySelectorAll("details.round"), function (d) { d.open = open; });
  }

  // ---------- whose argument is it: claim citations become seat marks ----------
  // Claim ids are seat:round:index (gemini:0:2); the seat in front is the one that first argued it.
  function citedSeat(m, id) {
    var mm = /^([A-Za-z0-9][\w.-]*):\d+:\d+$/.exec(id);
    return mm && m.participants.indexOf(mm[1]) >= 0 ? mm[1] : null;
  }
  function citeTitle(m, ids) {
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; })
      .map(function (id) { return citedSeat(m, id) + ": " + claimLabel(m, id); }).join("\n");
  }
  function citeMark(m, id) {
    return h("span", { class: "cite", title: citeTitle(m, [id]) }, mark(citedSeat(m, id)));
  }

  // Light Markdown (bold, italics, code) built from text nodes; claim ids become seat marks.
  function inlineMd(el, text, cite) {
    var re = /\*\*([^*]+)\*\*|\u0060([^\u0060]+)\u0060|\*([^*\s][^*]*)\*/g, last = 0, mm;
    while ((mm = re.exec(text))) {
      plainText(el, text.slice(last, mm.index), cite);
      if (mm[1] !== undefined) inlineMd(el.appendChild(h("b")), mm[1], cite);
      else if (mm[2] !== undefined) el.appendChild(cite(mm[2]) || h("code", { text: mm[2] }));
      else inlineMd(el.appendChild(h("i")), mm[3], cite);
      last = re.lastIndex;
    }
    plainText(el, text.slice(last), cite);
  }
  function plainText(el, text, cite) {
    var re = /[A-Za-z0-9][\w.-]*:\d+:\d+/g, last = 0, mm;
    while ((mm = re.exec(text))) {
      var node = cite(mm[0]);
      if (!node) continue;
      el.appendChild(document.createTextNode(text.slice(last, mm.index)));
      el.appendChild(node);
      last = re.lastIndex;
    }
    el.appendChild(document.createTextNode(text.slice(last)));
  }

  // The report, passage by passage, each marked with the seats whose claims it cites. A bracket
  // holding only citations, like (\u0060gemini:0:2\u0060, merged \u0060claude:0:4\u0060), moves into the marks.
  function renderAnswer(text, m) {
    var blocks = [], para = null;
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      var head = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
      var item = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (!line.trim()) para = null;
      else if (head) { blocks.push({ kind: "h", text: head[1] }); para = null; }
      else if (item) {
        var indent = item[1].replace(/\t/g, "    ").length;
        blocks.push({ kind: "li", lvl: Math.min(3, Math.ceil(indent / 4)), bullet: /\d/.test(item[2]) ? item[2] : "•", text: item[3] });
        para = null;
      } else if (para) para.text += " " + line.trim();
      else { para = { kind: "p", text: line.trim() }; blocks.push(para); }
    });
    var anyCites = false;
    var built = blocks.map(function (b) {
      var ids = [];
      var body = b.text.replace(/\s*\(([^()]*)\)/g, function (all, inner) {
        var found = [];
        var rest = inner.replace(/\u0060?([A-Za-z0-9][\w.-]*:\d+:\d+)\u0060?/g, function (tok, id) {
          if (!citedSeat(m, id)) return tok;
          found.push(id);
          return "";
        });
        rest = rest.replace(/\b(merged|into|and|also|see|claims?|incl|including|via|from|plus)\b/gi, "");
        if (!found.length || /[A-Za-z0-9]/.test(rest)) return all;
        ids.push.apply(ids, found);
        return "";
      });
      var el = h(b.kind === "h" ? "h4" : "div", { class: "txt" });
      inlineMd(el, body, function (tok) {
        if (!citedSeat(m, tok)) return null;
        ids.push(tok);
        return citeMark(m, tok);
      });
      if (ids.length) anyCites = true;
      return { b: b, el: el, ids: ids };
    });
    var wrap = h("div", { class: "answer" + (anyCites ? " cited" : "") },
      anyCites ? h("p", { class: "hint", text: "The marks beside each passage show whose argument it comes from. Hover one to see the claims." }) : null);
    built.forEach(function (x) {
      var row = h("div", { class: "blk " + x.b.kind });
      if (anyCites) {
        var seats = [];
        x.ids.forEach(function (id) { var s = citedSeat(m, id); if (seats.indexOf(s) < 0) seats.push(s); });
        row.appendChild(h("div", { class: "src", role: seats.length ? "img" : null, "aria-label": seats.length ? "From " + seats.join(", ") : null,
          title: x.ids.length ? citeTitle(m, x.ids) : null }, seats.map(function (s) { return mark(s); })));
      }
      if (x.b.kind === "li") {
        x.el.classList.add("li");
        x.el.setAttribute("data-bullet", x.b.bullet);
        x.el.style.setProperty("--lvl", String(x.b.lvl));
      }
      row.appendChild(x.el);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Which seats' answers made it in: the agreed points each seat argued first.
  function renderSources(result, m) {
    var counts = {}, titles = {}, total = 0;
    (result.claimResolutions || []).forEach(function (cr) {
      var s = cr.status === "resolved" ? citedSeat(m, cr.claimId) : null;
      if (!s) return;
      total += 1;
      counts[s] = (counts[s] || 0) + 1;
      (titles[s] = titles[s] || []).push(claimLabel(m, cr.claimId));
    });
    if (!total) return null;
    var seats = m.participants.slice().sort(function (a, b) { return (counts[b] || 0) - (counts[a] || 0); });
    return h("div", { class: "sources" }, h("span", { class: "sources-label", text: "Agreed points, by who argued them first" }),
      seats.map(function (s) {
        return h("span", { class: "chip" + (counts[s] ? "" : " none"), title: titles[s] ? titles[s].join("\n") : "None of this seat's own claims were agreed." },
          mark(s), s, h("small", { text: (counts[s] || 0) + " of " + total }));
      }));
  }

  function renderVerdict(result, m, openDetails) {
    var report = result.report || {};
    var card = h("div", { class: "card verdict " + result.status },
      h("div", { class: "meta" }, statusPill(result.status),
        result.representative ? h("span", null, "Written by ", h("b", { style: "color:var(--ink)", text: result.representative.participantId }), ", the top peer score") : null),
      report.finalSummary ? h("p", { class: "big", text: report.finalSummary }) : null,
      renderSources(result, m));
    if (report.representativeSpeech) {
      var d = h("details", { class: "more", "data-key": "speech" }, h("summary", { text: "Full report" }), renderAnswer(report.representativeSpeech, m));
      d.open = openDetails.speech !== false;
      card.appendChild(h("div", { style: "margin-top:14px" }, d));
    }
    if (result.disagreements && result.disagreements.length) {
      card.appendChild(h("div", { class: "block-label", text: "Open disagreements" }));
      result.disagreements.forEach(function (dg) { card.appendChild(h("p", { class: "rationale", text: (dg.claimId ? claimLabel(m, dg.claimId) + ": " : "") + (dg.reason || JSON.stringify(dg)) })); });
    }
    if (result.eliminations && result.eliminations.length) {
      card.appendChild(h("div", { class: "block-label", text: "Seats that dropped out" }));
      result.eliminations.forEach(function (el) {
        var known = m.eliminated[el.participantId] || {};
        var drop = dropReason(el.reason, el.error || known.error);
        card.appendChild(h("p", { class: "rationale" }, h("b", { text: el.participantId }), " in round " + el.round + ": " + drop.label + (drop.limit && drop.text ? " — " + drop.text : "")));
      });
    }
    return h("div", { class: "section", style: "margin-top:0" }, h("h3", { text: "Verdict" }), card);
  }

  function renderRound(r, m, openDetails) {
    var name = phaseName(r);
    var key = "round:" + r.round;
    // One line per round while folded: who answered, who is still thinking, stance totals.
    var stances = { agree: 0, disagree: 0, revise: 0 };
    var votes = { accept: 0, reject: 0 };
    var chips = r.participants.map(function (pid) {
      var resp = r.responses[pid];
      (resp && resp.judgementsDetail || []).forEach(function (j) { if (stances[j.stance] !== undefined) stances[j.stance] += 1; });
      (resp && resp.claimVotesDetail || []).forEach(function (v) { if (votes[v.vote] !== undefined) votes[v.vote] += 1; });
      var st = !resp ? "thinking" : resp.eliminated ? "dropped" : "done";
      return h("span", { class: "seat-chip " + st, title: st === "dropped" ? dropReason(resp.reason, resp.error).label : null }, mark(pid), pid,
        st === "thinking" ? h("span", { class: "dot" }) : h("span", { class: "st", text: st === "dropped" ? "✕" : "✓" }));
    });
    var stats = [];
    if (stances.agree + stances.disagree + stances.revise) stats.push(stances.agree + " agree · " + stances.disagree + " disagree · " + stances.revise + " revise");
    if (votes.accept + votes.reject) stats.push(votes.accept + " accept · " + votes.reject + " reject");
    if (r.merges.length) stats.push(r.merges.length + " merged");
    var wrap = h("details", { class: "round card", "data-key": key },
      h("summary", null,
        h("span", { class: "round-title" }, h("b", { text: "Round " + r.round + " · " + name[0] }), h("span", { text: name[1] })),
        h("span", { class: "round-meta" }, chips, stats.length ? h("span", { class: "round-stats", text: stats.join("  ·  ") }) : null)));
    wrap.open = openDetails[key] === true;
    var lanes = h("div", { class: "lanes", style: "grid-template-columns: repeat(" + Math.max(1, r.participants.length) + ", minmax(0, 1fr))" });
    r.participants.forEach(function (pid) { lanes.appendChild(renderLane(r, pid, m, openDetails)); });
    wrap.appendChild(lanes);
    r.merges.forEach(function (mg) {
      wrap.appendChild(h("p", { class: "note", text: "Merged \u201c" + claimLabel(m, mg.from) + "\u201d into \u201c" + claimLabel(m, mg.into) + "\u201d: the seats judged them to say the same thing." }));
    });
    if (r.completed) {
      var cp = r.completed;
      wrap.appendChild(h("p", { class: "note", text: "Round done: " + cp.completed + " answered" + (cp.failed ? ", " + cp.failed + " failed" : "") + (cp.timedOut ? ", " + cp.timedOut + " timed out" : "") +
        " · " + cp.claimCatalogSize + " claims on the table" + (cp.newClaims ? " (" + cp.newClaims + " new)" : "") + (cp.mergeCount ? " · " + cp.mergeCount + " merged" : "") }));
    }
    return wrap;
  }

  function renderLane(r, pid, m, openDetails) {
    var resp = r.responses[pid];
    var lane = h("div", { class: "card lane", style: themeVars(themeFor(pid)) },
      h("div", { class: "lane-head" }, mark(pid), h("b", { text: pid }), h("span", { class: "model", text: seatUsedText(pid) }),
        !resp ? null : resp.eliminated ? h("span", { class: "pill " + (dropReason(resp.reason, resp.error).limit ? "limit" : "eliminated"), text: dropReason(resp.reason, resp.error).label }) : null));
    if (!resp) { lane.appendChild(h("p", { class: "waiting" }, h("span", { class: "dot" }), "thinking…")); return lane; }
    if (resp.eliminated) { lane.appendChild(dropDetails(dropReason(resp.reason, resp.error))); return lane; }

    if (resp.summary) lane.appendChild(h("p", { class: "summary", text: resp.summary }));

    var claims = resp.extractedClaimsDetail || [];
    if (claims.length) {
      lane.appendChild(h("div", { class: "block-label", text: "Claims proposed" }));
      claims.forEach(function (cl, i) {
        lane.appendChild(h("div", { class: "claim" }, h("span", { class: "id", text: pid + ":" + r.round + ":" + i + (cl.category ? " · " + cl.category : "") }),
          h("div", { class: "title", text: cl.title }), h("p", { text: cl.statement })));
      });
    }

    var judgements = resp.judgementsDetail || [];
    if (judgements.length) {
      lane.appendChild(h("div", { class: "block-label", text: "How it judged the claims" }));
      judgements.forEach(function (j) {
        var claim = m.claims[j.claimId];
        var pct = Math.round((j.confidence || 0) * 100);
        lane.appendChild(h("div", { class: "judgement " + j.stance },
          h("div", { class: "j-top" }, h("span", { class: "pill " + j.stance, text: j.stance }),
            h("span", { class: "target", title: claim ? claim.statement : "", text: claimLabel(m, j.claimId) }),
            claim && claim.by ? h("span", { class: "mono", text: "by " + claim.by }) : null,
            h("span", { class: "conf" }, h("span", { class: "bar" }, h("i", { style: "width:" + pct + "%" })), pct + "% sure")),
          j.rationale ? h("p", { class: "rationale", text: j.rationale }) : null,
          j.revisedStatement ? h("p", { class: "revised" }, h("b", { text: "Proposed wording" }), j.revisedStatement) : null));
      });
    }

    var votes = resp.claimVotesDetail || [];
    if (votes.length) {
      lane.appendChild(h("div", { class: "block-label", text: "Votes" }));
      votes.forEach(function (v) {
        lane.appendChild(h("div", { class: "judgement " + (v.vote === "accept" ? "agree" : "disagree") },
          h("div", { class: "j-top" }, h("span", { class: "pill " + v.vote, text: v.vote }), h("span", { class: "target", text: claimLabel(m, v.claimId) })),
          v.reason ? h("p", { class: "rationale", text: v.reason }) : null));
      });
    }

    if (resp.fullResponse) {
      var key = "full:" + r.round + ":" + pid;
      var d = h("details", { class: "more", "data-key": key, style: "margin-top:12px" }, h("summary", { text: "Full answer" }), h("p", { class: "prose", text: resp.fullResponse }));
      d.open = !!openDetails[key];
      lane.appendChild(d);
    }
    return lane;
  }

  // The seat that argued a claim first leads; seats that proposed the same point follow.
  function proposers(fc, m) {
    var first = citedSeat(m, fc.claimId);
    var list = (fc.proposedBy || []).slice();
    if (first && list.indexOf(first) > 0) { list.splice(list.indexOf(first), 1); list.unshift(first); }
    return list;
  }

  function renderClaims(result, m) {
    var res = {};
    (result.claimResolutions || []).forEach(function (cr) { res[cr.claimId] = cr; });
    var rows = (result.finalClaims || []).slice().sort(function (a, b) {
      return (a.status === "merged") - (b.status === "merged");
    });
    var table = h("table", { class: "claims-table" });
    rows.forEach(function (fc) {
      var cr = res[fc.claimId];
      var label = fc.status === "merged" ? h("span", { class: "pill", text: "merged into " + claimLabel(m, fc.mergedInto) }) :
        cr ? (cr.status === "resolved" ? h("span", { class: "pill accept", text: "accepted" }) : h("span", { class: "pill reject", text: "not agreed" })) :
        h("span", { class: "pill", text: fc.status || "—" });
      table.appendChild(h("tr", { class: fc.status === "merged" ? "merged" : null },
        h("td", null, h("div", { class: "ct", text: fc.title }), h("p", { class: "stmt", text: fc.statement }),
          h("div", { class: "by" }, "proposed by ", proposers(fc, m).map(function (p) { return h("span", { class: "by-seat" }, mark(p), p); }))),
        h("td", { class: "tally" }, label, cr ? h("div", { class: "by", text: cr.acceptCount + " accept · " + cr.rejectCount + " reject of " + cr.totalVoters }) : null)));
    });
    return h("div", { class: "section" }, h("h3", { text: "Claims and how they were resolved" }), h("div", { class: "card" }, table));
  }

  function renderScores(result) {
    var LABELS = { correctness: "Correctness", completeness: "Completeness", actionability: "Actionability", consistency: "Consistency" };
    var ranked = (result.scoreboard || []).slice().sort(function (a, b) { return b.total - a.total; });
    var grid = h("div", { class: "grid3" });
    ranked.forEach(function (s, i) {
      var card = h("div", { class: "card score", style: themeVars(themeFor(s.participantId)) },
        h("div", { class: "score-total" }, h("b", { text: s.total.toFixed(1) }), mark(s.participantId), h("span", { style: "font-weight:650", text: s.participantId }),
          i === 0 ? h("span", { class: "crown", text: "wrote the report" }) : null));
      Object.keys(LABELS).forEach(function (k) {
        var v = s.breakdown ? s.breakdown[k] : null;
        if (typeof v !== "number") return;
        card.appendChild(h("div", { class: "score-row" }, h("span", { text: LABELS[k] }),
          h("span", { class: "track" }, h("i", { style: "width:" + Math.max(0, Math.min(100, v)) + "%" })),
          h("span", { style: "text-align:right;font-variant-numeric:tabular-nums", text: v.toFixed(0) })));
      });
      grid.appendChild(card);
    });
    return h("div", { class: "section" }, h("h3", { text: "Peer scores" }),
      h("p", { class: "hint", style: "margin:-6px 0 12px", text: "Seats score each other: correctness 35%, completeness 25%, actionability 25%, consistency 15%." }), grid);
  }

  function stopRun() {
    var id = state.selected;
    ask({ title: "Stop this debate?", message: "The agents stop now and no result is written.", confirm: "Stop debate", danger: true })
      .then(function (yes) {
        if (!yes) return;
        api("/api/runs/" + encodeURIComponent(id) + "/stop", { method: "POST" }).then(poll).catch(function (e) { notify(e.message, "error"); });
      });
  }

  // ---------- usage rings ----------
  var R = 24, C = 2 * Math.PI * R;
  function fmtReset(seconds) {
    if (!seconds) return "";
    var ms = seconds * 1000 - Date.now();
    if (ms <= 0) return "resetting";
    var mins = Math.round(ms / 60000);
    if (mins < 60) return "resets in " + mins + "m";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return "resets in " + hrs + "h " + (mins % 60) + "m";
    return "resets in " + Math.floor(hrs / 24) + "d " + (hrs % 24) + "h";
  }
  function fmtAgo(iso) {
    if (!iso) return "";
    var mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!(mins >= 0)) return "";
    return mins < 1 ? "just now" : mins < 60 ? mins + " min ago" : Math.round(mins / 60) + " h ago";
  }
  function fmtTokens(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n); }

  // Pods are created once and then updated in place, so the ring animates from its last value.
  var pods = {};
  function buildPod(seat) {
    var t = paint(themeForSeat(null, seat.cliType) || { name: seat.cliType, color: "#555", soft: "#e8e8e8", glyph: "●" });
    var gid = "g-" + seat.cliType;
    var defs = t.gradient ? svg("defs", {}, svg("linearGradient", { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" },
      svg("stop", { offset: "0", "stop-color": t.gradient[0] }), svg("stop", { offset: ".55", "stop-color": t.gradient[1] }), svg("stop", { offset: "1", "stop-color": t.gradient[2] }))) : null;
    var stroke = t.gradient ? "url(#" + gid + ")" : t.color;
    var track = svg("circle", { class: "track", cx: 30, cy: 30, r: R, stroke: t.soft });
    var fill = svg("circle", { class: "fill", cx: 30, cy: 30, r: R, stroke: stroke, "stroke-dasharray": C, "stroke-dashoffset": C, transform: "rotate(-90 30 30)" });
    var orbit = svg("circle", { class: "orbit", cx: 30, cy: 30, r: R, stroke: stroke, "stroke-dasharray": "10 " + (C - 10), opacity: ".9" });
    orbit.style.display = "none";
    var glyph;
    if (t.knot) {
      glyph = svg("g", { transform: "translate(18.6 18.6) scale(.95)" }, knot(t.color));
    } else {
      glyph = svg("text", { x: 30, y: 31, "text-anchor": "middle", "dominant-baseline": "middle", class: "glyph",
        fill: t.gradient ? "url(#" + gid + ")" : t.color });
      glyph.textContent = t.glyph;
    }
    var num = h("span", { class: "num" });
    var sub = h("span", { class: "sub" });
    var who = h("span", { class: "who" });
    var tip = h("div", { class: "tip" });
    var el = h("div", { class: "pod", tabindex: "0" }, svg("svg", { class: "ring", viewBox: "0 0 60 60" }, defs, track, fill, orbit, glyph), num, sub, who, tip);
    return { el: el, fill: fill, orbit: orbit, glyph: glyph, num: num, sub: sub, who: who, tip: tip, theme: t };
  }
  function updatePod(pod, seat) {
    var u = seat.usage; var t = pod.theme;
    pod.who.textContent = seat.agents.join(", ");
    pod.tip.textContent = "";
    pod.sub.textContent = "";
    pod.tip.appendChild(h("b", { text: t.name }));
    var pct = null;
    if (u.kind === "limits") {
      // Like Claude Code's ring: fill shows the shortest window, the one you hit first.
      pct = u.windows.length ? u.windows[0].usedPercent : 0;
      pod.num.textContent = Math.round(pct) + "%";
      pod.num.appendChild(h("small", { text: " used" }));
      // The other window (the week, for Claude and Codex) right under the ring, not only on hover.
      if (u.windows.length > 1) pod.sub.textContent = shortWindow(u.windows[1].label) + " " + Math.round(u.windows[1].usedPercent) + "%";
      u.windows.forEach(function (w) {
        pod.tip.appendChild(h("div", { class: "w" }, h("span", { text: w.label + " limit" }), h("span", { text: Math.round(100 - w.usedPercent) + "% left" }),
          h("small", { text: fmtReset(w.resetsAt) })));
      });
      var from = u.live ? (u.source === "claude" ? "Checked with your Claude account" : u.source === "antigravity" ? "Read from Antigravity's /usage" : "Checked with your Codex account") :
        u.source === "claude" ? "Reported by Claude with its last answer" : "Read from Codex's own log";
      pod.tip.appendChild(h("div", { class: "muted", text: from + (u.observedAt ? ", " + fmtAgo(u.observedAt) : "") + ". Shared with everything else you use this plan for." +
        (u.live ? (u.source === "antigravity" ? " Refreshed about once a minute." : " Refreshed every minute, every 15 seconds while a debate runs.") :
          u.source === "claude" ? (u.note ? "" : " Updates when Claude answers.") : " Refreshed every minute.") }));
      if (u.note) pod.tip.appendChild(h("div", { class: "muted", text: u.note }));
      if (u.canCheck) pod.tip.appendChild(checkButton());
    } else if (u.kind === "tokens") {
      pod.num.textContent = fmtTokens(u.totalTokens);
      pod.num.appendChild(h("small", { text: " tokens" }));
      pod.sub.textContent = "used today";
      pod.tip.appendChild(h("div", { text: "argue used " + u.totalTokens.toLocaleString() + " tokens today across " + u.calls + " call" + (u.calls === 1 ? "" : "s") + "." }));
      pod.tip.appendChild(h("div", { class: "muted", text: "Antigravity only shows its quota inside the Antigravity app (model picker). It doesn't share it with command-line tools, so there's no % ring here. This quota is separate from the Gemini app's daily limit." }));
    } else {
      pod.num.textContent = "—";
      if (u.canCheck) pod.sub.textContent = "not checked";
      pod.tip.appendChild(h("div", { class: "muted", text: u.reason }));
      if (u.canCheck) pod.tip.appendChild(checkButton());
    }
    pod.orbit.style.display = pct === null ? "" : "none";
    if (pct !== null) {
      var stroke = pct >= 90 ? "#b93a32" : pct >= 75 ? "#c07a12" : null;
      pod.fill.style.stroke = stroke || "";
      var target = C * (1 - Math.min(100, Math.max(0, pct)) / 100);
      requestAnimationFrame(function () { pod.fill.setAttribute("stroke-dashoffset", String(Math.max(0.001, target))); });
    } else {
      pod.fill.setAttribute("stroke-dashoffset", String(C));
    }
  }
  function shortWindow(label) {
    return /7-day$|weekly$/.test(label) ? "week" : /5-hour$/.test(label) ? "5h" : label;
  }
  // "Check now": one tiny Claude reply, which renews Claude Code's login and reports usage.
  function checkButton() {
    var btn = h("button", { class: "btn ghost small check", type: "button", title: "Sends Claude one tiny Haiku message. Uses a sliver of your plan." }, "Check now");
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Checking…";
      api("/api/usage/claude/check", { method: "POST" }).then(function (r) {
        if (!r.ok) notify("Claude usage: " + (r.message || "no answer"), "error");
        return loadUsage();
      }).catch(function (e) { notify(e.message, "error"); btn.disabled = false; btn.textContent = "Check now"; });
    });
    return btn;
  }
  function loadUsage() {
    if (state.closed) return Promise.resolve();
    return api("/api/usage").then(function (data) {
      var box = document.getElementById("usage");
      var seen = {};
      var hint = box.querySelector("p.hint");
      if (hint && data.seats.length) hint.remove();
      data.seats.forEach(function (seat) {
        seen[seat.cliType] = 1;
        if (!pods[seat.cliType]) { pods[seat.cliType] = buildPod(seat); }
        box.appendChild(pods[seat.cliType].el);
        updatePod(pods[seat.cliType], seat);
      });
      Object.keys(pods).forEach(function (k) { if (!seen[k]) { pods[k].el.remove(); delete pods[k]; } });
      if (!data.seats.length && !box.firstChild) box.appendChild(h("p", { class: "hint", text: "No CLI seats yet." }));
    }).catch(function () {});
  }

  // ---------- quit ----------
  document.getElementById("quit").addEventListener("click", function () {
    var running = Object.keys(state.cache).some(function (id) { var c = state.cache[id]; return c.process && c.process.state === "running"; });
    (running ? ask({ title: "Quit the desk?", message: "A debate is still running. Quitting stops it too.", confirm: "Quit", danger: true })
      : Promise.resolve(true)).then(function (yes) {
      if (yes) api("/api/shutdown", { method: "POST" }).then(showClosed).catch(showClosed);
    });
  });
  function showClosed() {
    state.closed = true;
    clearTimeout(state.pollTimer);
    document.body.appendChild(h("div", { class: "scrim" }, h("div", { class: "card closed-screen" },
      h("b", { text: "Debate desk closed" }),
      h("p", { class: "hint", text: "Nothing is running and no tokens are being used. You can close this tab. Open the desk again from your shortcut." }))));
  }

  // A restarted "argue ui" prints a new link; opening it in this tab only changes the hash.
  window.addEventListener("hashchange", function () { location.reload(); });
  function showStaleToken() {
    if (document.getElementById("stale-banner") || state.closed) return;
    var banner = h("div", { id: "stale-banner", class: "card verdict failed", style: "margin-bottom:18px" },
      h("b", { text: "This page is out of date" }),
      h("p", { class: "rationale", text: "The desk was restarted or closed, so this tab's access link no longer works. Open it again from your shortcut, or use the new link printed in the terminal." }));
    document.getElementById("banner-slot").appendChild(banner);
  }

  if (!token) {
    document.getElementById("main").textContent = "Missing access token. Open the desk from its shortcut or the link printed by argue ui.";
    return;
  }
  applyTheme();
  loadConfig().then(function () {
    loadUsage(); loadLibrary();
    scanClis(false).catch(function () {});
    scanClis(true).catch(function () {});
    return refreshRuns();
  }).then(function () { showView("composer"); });
  setInterval(function () { if (!state.closed) refreshRuns(); }, 5000);
  // Plan usage every minute, every 15 s while a debate runs (and right after any seat answers, from poll()).
  var lastUsageAt = Date.now();
  setInterval(function () {
    var running = (state.runs || []).some(function (r) { return runStatus(r) === "in_progress" && (!r.process || r.process.state === "running"); });
    if (running || Date.now() - lastUsageAt >= 60000) { lastUsageAt = Date.now(); loadUsage(); }
  }, 15000);
})();
</script>
</body>
</html>
`;
