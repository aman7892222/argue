// The debate desk UI: one self-contained page (no external assets, no build step).
// Written with String.raw so regexes keep their backslashes; the client code below
// deliberately avoids backticks and dollar-brace so nothing is interpolated by this module.
// All model-generated text is inserted with textContent, never innerHTML.

export function renderUiPage(): string {
  return PAGE;
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>argue · debate desk</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%23D97757' stroke-width='4' stroke-dasharray='27 100'/%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%23111' stroke-width='4' stroke-dasharray='27 100' stroke-dashoffset='-27.2'/%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='%239B72CB' stroke-width='4' stroke-dasharray='27 100' stroke-dashoffset='-54.4'/%3E%3C/svg%3E">
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
  --codex: #111111; --codex-soft: #e9e9e9;
  --gemini: #7b6fd8; --gemini-soft: #ecebfb;
  --gemini-g: linear-gradient(100deg, #4285F4 0%, #9B72CB 55%, #D96570 100%);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 var(--sans); }
body { background: radial-gradient(1200px 600px at 85% -10%, #fbf7f0 0%, transparent 60%), var(--bg); min-height: 100vh; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.app { display: grid; grid-template-columns: 352px 1fr; min-height: 100vh; }
aside { border-right: 1px solid var(--line); background: rgba(255, 252, 246, .7); backdrop-filter: blur(6px); padding: 22px 20px 18px;
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
.pod .who { font-size: 11.5px; color: var(--muted); max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pod .tip { display: none; position: absolute; top: calc(100% - 2px); left: 50%; transform: translateX(-50%); z-index: 30; width: 268px; padding: 12px 14px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 10px 34px rgba(40, 30, 10, .16); font-size: 12.5px; line-height: 1.55; text-align: left; }
.pod:first-child .tip { left: 0; transform: none; }
.pod:last-child .tip { left: auto; right: 0; transform: none; }
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
textarea, select, input[type=text] { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; background: #fff; font-weight: 400; color: var(--ink); }
textarea { min-height: 92px; resize: vertical; line-height: 1.5; }
textarea:focus, select:focus, input[type=text]:focus { outline: none; border-color: var(--focus); box-shadow: 0 0 0 3px rgba(201, 185, 158, .3); }
.seats { display: grid; gap: 6px; }
.seat-opt { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 11px;
  cursor: pointer; color: var(--ink); font-weight: 600; background: #fff; transition: border-color .15s; }
.seat-opt:hover { border-color: #d5cab6; }
.seat-opt input { accent-color: var(--ink); margin: 0; }
.seat-opt small { color: var(--muted); font-weight: 450; margin-left: auto; font-size: 11.5px; max-width: 132px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seat-opt .rm { display: none; position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: var(--panel); color: var(--muted);
  width: 24px; height: 24px; border-radius: 7px; font-size: 15px; line-height: 1; }
.seat-opt:hover .rm { display: block; }
.seat-opt:hover small { visibility: hidden; }
.seat-opt .rm:hover { color: var(--disagree); background: var(--disagree-bg); }
.mark { width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; flex: none; }
.link-btn { border: 1px dashed #d8cdb9; background: transparent; border-radius: 11px; padding: 8px 10px; color: var(--ink2); font-weight: 600; font-size: 13px; text-align: left; }
.link-btn:hover { background: #fff; border-style: solid; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.btn { border: 0; border-radius: 11px; padding: 11px 16px; font-weight: 650; background: var(--ink); color: #fff; letter-spacing: .01em; transition: transform .1s, opacity .15s; }
.btn:hover { opacity: .92; }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); font-weight: 600; padding: 7px 12px; }
.btn.ghost:hover { background: #fff; }
.btn.small { padding: 5px 11px; font-size: 12.5px; }
.btn.danger { background: var(--disagree-bg); color: var(--disagree); }
.hint { font-size: 12px; color: var(--muted); margin: 0; line-height: 1.5; }
.err { color: var(--disagree); font-size: 13px; margin: 0; white-space: pre-wrap; }
.runs { display: grid; gap: 6px; }
.run-item { text-align: left; border: 1px solid transparent; border-radius: 12px; padding: 9px 11px; background: transparent; display: grid; gap: 3px; }
.run-item:hover { background: var(--panel); border-color: var(--line); }
.run-item.active { background: var(--panel); border-color: #d5cab6; box-shadow: var(--shadow); }
.run-item .t { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-item .m { display: flex; gap: 8px; align-items: center; font-size: 11.5px; color: var(--muted); }
.side-foot { margin-top: auto; padding-top: 18px; display: flex; align-items: center; gap: 8px; }
.side-foot .hint { flex: 1; }

/* pills */
.pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--soft); color: var(--muted); white-space: nowrap; }
.pill.consensus, .pill.accept, .pill.agree { background: var(--agree-bg); color: var(--agree); }
.pill.failed, .pill.reject, .pill.disagree, .pill.eliminated { background: var(--disagree-bg); color: var(--disagree); }
.pill.partial_consensus, .pill.interrupted, .pill.revise, .pill.stale, .pill.stopped, .pill.unresolved { background: var(--revise-bg); color: var(--revise); }
.pill.in_progress, .pill.running { background: var(--live-bg); color: var(--live); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.pill.running .dot, .pill.in_progress .dot, .waiting .dot { animation: pulse 1.2s infinite ease-in-out; }
@keyframes pulse { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }

/* main */
.empty { color: var(--muted); padding: 90px 10px; text-align: center; }
.empty b { color: var(--ink); display: block; font: 600 26px/1.3 var(--serif); margin-bottom: 8px; }
.head { display: grid; gap: 12px; margin-bottom: 26px; }
.head h1 { font: 600 32px/1.22 var(--serif); margin: 0; letter-spacing: -.012em; text-wrap: balance; }
.head .prompt { color: var(--muted); margin: 0; white-space: pre-wrap; font-size: 15px; }
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

/* rounds */
details.round { margin-bottom: 10px; }
details.round > summary { color: var(--ink); font-weight: 400; font-size: 14px; padding: 14px 18px; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center; gap: 6px 12px; border-radius: 16px; }
details.round > summary::before { content: "›"; color: var(--muted); font-size: 18px; line-height: 1; transition: transform .2s; display: inline-block; width: 10px; }
details.round[open] > summary::before { transform: rotate(90deg); }
details.round > summary:hover { background: #fffaf2; }
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
.claim { border: 1px solid var(--line); border-radius: 11px; padding: 9px 11px; margin-bottom: 7px; background: #fffcf7; }
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
.scrim { position: fixed; inset: 0; background: rgba(30, 24, 16, .32); backdrop-filter: blur(3px); display: grid; place-items: center; z-index: 50; padding: 16px; }
.modal { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 22px 24px; }
.modal h2 { font: 600 22px/1.3 var(--serif); margin: 0 0 4px; }
.cli-list { display: grid; gap: 7px; margin: 14px 0; }
.cli-opt { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; text-align: left; }
.cli-opt.sel { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.cli-opt small { color: var(--muted); display: block; font-size: 11.5px; }
.cli-opt .pick { margin-left: auto; }
.modal .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.closed-screen { text-align: center; max-width: 420px; padding: 34px 30px; }
.closed-screen b { display: block; font: 600 24px/1.3 var(--serif); margin-bottom: 8px; }

@media (max-width: 920px) {
  .app { grid-template-columns: 1fr; }
  aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  main { padding: 24px 16px 70px; }
  .head h1 { font-size: 26px; }
}
@media (max-width: 680px) { .lanes { grid-template-columns: 1fr !important; } }
</style>
</head>
<body>
<div class="app">
  <aside>
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="#D97757" stroke-width="4" stroke-dasharray="24 100"/><circle cx="16" cy="16" r="12" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="24 100" stroke-dashoffset="-25.1"/><circle cx="16" cy="16" r="12" fill="none" stroke="#9B72CB" stroke-width="4" stroke-dasharray="24 100" stroke-dashoffset="-50.2"/></svg>
      <b>argue</b><span>debate desk</span>
    </div>
    <div class="eyebrow">Plan usage</div>
    <div class="usage" id="usage"></div>

    <div class="eyebrow">New debate</div>
    <div class="card form" id="new-form">
      <label class="field">What should they debate?
        <textarea id="task" placeholder="e.g. Should a two-person startup build its MVP as a monolith or microservices?"></textarea>
      </label>
      <div class="field">Seats
        <div class="seats" id="seats"></div>
        <button class="link-btn" id="add-seat" type="button">+ Connect another CLI</button>
      </div>
      <div class="row2">
        <label class="field">Max rounds
          <select id="rounds"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select>
        </label>
        <label class="field">Consensus needs
          <select id="threshold">
            <option value="1">Everyone</option>
            <option value="0.67">Two-thirds</option>
            <option value="0.51">Majority</option>
          </select>
        </label>
      </div>
      <button class="btn" id="start">Start debate</button>
      <p class="err" id="form-error" hidden></p>
    </div>

    <div class="eyebrow">Debates</div>
    <div class="runs" id="runs"><p class="hint">Loading…</p></div>

    <div class="side-foot">
      <p class="hint">Runs only on this computer. Nothing runs once you quit.</p>
      <button class="btn ghost small" id="quit">Quit</button>
    </div>
  </aside>
  <main id="main">
    <div class="empty"><b>Pick a debate or start a new one</b>Results show up first; open any round to read the reasoning.</div>
  </main>
</div>
<script>
(function () {
  "use strict";
  var token = (new URLSearchParams(location.hash.slice(1))).get("t") || "";
  var PALETTE = ["#3d5bd9", "#0c8599", "#2f7d4a", "#ae3ec9", "#c2255c", "#e8590c"];
  var THEMES = {
    claude: { name: "Claude", color: "#D97757", soft: "#fbeae2", glyph: "✻" },
    codex: { name: "ChatGPT · Codex", color: "#111111", soft: "#e6e6e6", glyph: "◐", mono: true },
    antigravity: { name: "Gemini · Antigravity", color: "#7b6fd8", soft: "#ecebfb", glyph: "✦", gradient: ["#4285F4", "#9B72CB", "#D96570"] },
    gemini: { name: "Gemini CLI", color: "#7b6fd8", soft: "#ecebfb", glyph: "✦", gradient: ["#4285F4", "#9B72CB", "#D96570"] }
  };
  var state = { config: null, runs: [], selected: null, cache: {}, pollTimer: null, closed: false };

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

  // ---------- seat themes ----------
  function agentInfo(id) {
    return state.config ? state.config.agents.filter(function (a) { return a.id === id; })[0] : null;
  }
  function themeFor(id) {
    var a = agentInfo(id);
    if (a && THEMES[a.cliType]) return THEMES[a.cliType];
    var ids = state.config ? state.config.agents.map(function (x) { return x.id; }) : [];
    var idx = Math.max(0, ids.indexOf(id));
    var color = PALETTE[idx % PALETTE.length];
    return { name: id, color: color, soft: "#eef0f6", glyph: (id[0] || "?").toUpperCase() };
  }
  function themeVars(t) {
    return "--c:" + t.color + (t.gradient ? ";--g:linear-gradient(100deg," + t.gradient.join(",") + ")" : "");
  }
  function mark(id) {
    var t = themeFor(id);
    var style = t.gradient ? "background:linear-gradient(135deg," + t.gradient.join(",") + ");color:#fff"
      : t.mono ? "background:#111;color:#fff" : "background:" + t.soft + ";color:" + t.color;
    return h("span", { class: "mark", style: style, text: t.glyph });
  }
  function agentModel(id) {
    var a = agentInfo(id);
    return a ? a.provider + " · " + a.model : "";
  }

  var STATUS_LABEL = { consensus: "Consensus", partial_consensus: "Partial consensus", unresolved: "Unresolved", interrupted: "Interrupted",
    failed: "Failed", in_progress: "Running", running: "Running", stale: "No activity", stopped: "Stopped" };
  function statusPill(status) { return h("span", { class: "pill " + status }, h("span", { class: "dot" }), STATUS_LABEL[status] || status); }
  function fmtElapsed(ms) {
    if (typeof ms !== "number") return "";
    var s = Math.round(ms / 1000);
    return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s";
  }
  function fmtWhen(requestId) {
    var m = /^argue_(\d+)/.exec(requestId);
    return m ? new Date(Number(m[1])).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : requestId;
  }

  // ---------- config + seats ----------
  function loadConfig() {
    return api("/api/config").then(function (cfg) {
      var prevChecked = {};
      [].forEach.call(document.querySelectorAll("#seats input"), function (c) { prevChecked[c.value] = c.checked; });
      state.config = cfg;
      var box = document.getElementById("seats");
      box.textContent = "";
      cfg.agents.forEach(function (a) {
        var cb = h("input", { type: "checkbox", value: a.id });
        cb.checked = a.id in prevChecked ? prevChecked[a.id] : cfg.defaults.agents.indexOf(a.id) >= 0;
        box.appendChild(h("label", { class: "seat-opt" }, cb, mark(a.id), a.id, h("small", { text: a.model }),
          h("button", { class: "rm", type: "button", title: "Remove this seat", "aria-label": "Remove seat " + a.id,
            onclick: function (ev) { ev.preventDefault(); removeSeat(a.id); } }, "×")));
      });
      var rounds = document.getElementById("rounds");
      if (cfg.defaults.maxRounds >= 1 && cfg.defaults.maxRounds <= 5 && !state.roundsTouched) rounds.value = String(cfg.defaults.maxRounds);
      var th = document.getElementById("threshold");
      var match = [].slice.call(th.options).filter(function (o) { return Number(o.value) === cfg.defaults.threshold; })[0];
      if (match && !state.thresholdTouched) th.value = match.value;
    }).catch(function (e) { showFormError("Could not load config: " + e.message); });
  }
  document.getElementById("rounds").addEventListener("change", function () { state.roundsTouched = true; });
  document.getElementById("threshold").addEventListener("change", function () { state.thresholdTouched = true; });
  function removeSeat(id) {
    if (!confirm("Remove the seat \u201c" + id + "\u201d from this workspace? Past debates keep their results.")) return;
    api("/api/seats/" + encodeURIComponent(id), { method: "DELETE" }).then(function () { return loadConfig().then(loadUsage); })
      .catch(function (e) { showFormError(e.message); });
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
    showFormError("");
    btn.disabled = true; btn.textContent = "Starting…";
    api("/api/runs", { method: "POST", body: {
      task: task, agents: agents,
      maxRounds: Number(document.getElementById("rounds").value),
      threshold: Number(document.getElementById("threshold").value)
    } }).then(function (res) {
      document.getElementById("task").value = "";
      return refreshRuns().then(function () { select(res.requestId); });
    }).catch(function (e) { showFormError(e.message); })
      .then(function () { btn.disabled = false; btn.textContent = "Start debate"; });
  });

  // ---------- connect another CLI ----------
  document.getElementById("add-seat").addEventListener("click", openAddSeat);
  function openAddSeat() {
    var chosen = null;
    var nameInput = h("input", { type: "text", placeholder: "e.g. claude-sonnet" });
    var modelInput = h("input", { type: "text", list: "model-options", placeholder: "model id" });
    var modelList = h("datalist", { id: "model-options" });
    var cmdInput = h("input", { type: "text", placeholder: "command, e.g. mycli or C:\\tools\\mycli.exe" });
    var argsInput = h("input", { type: "text", placeholder: "flags, e.g. --print --model {providerModel}" });
    var custom = h("div", { style: "display:none;gap:12px", class: "custom-fields" },
      h("label", { class: "field" }, "Command", cmdInput),
      h("label", { class: "field" }, "Flags (space-separated)", argsInput,
        h("span", { class: "hint", text: "argue sends the prompt on stdin. Use {providerModel} for the model, or {prompt} if the CLI only takes the prompt as an argument." })));
    var err = h("p", { class: "err", hidden: true });
    var list = h("div", { class: "cli-list" }, h("p", { class: "waiting" }, h("span", { class: "dot" }), "Looking for installed CLIs… (asks each CLI for its model list; no prompts, no tokens)"));
    var save = h("button", { class: "btn", disabled: true }, "Add seat");
    var scrim = h("div", { class: "scrim", onclick: function (ev) { if (ev.target === scrim) close(); } },
      h("div", { class: "card modal", role: "dialog", "aria-modal": "true", "aria-label": "Connect another CLI" },
        h("h2", { text: "Connect another CLI" }),
        h("p", { class: "hint", text: "Any agent CLI on this computer can take a seat. Pick one, choose its model and give the seat a name." }),
        list,
        h("div", { style: "display:grid;gap:12px" },
          h("label", { class: "field" }, "Seat name", nameInput),
          h("label", { class: "field" }, "Model", modelInput, modelList),
          custom),
        err,
        h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: close }, "Cancel"), save)));
    document.body.appendChild(scrim);
    function close() { scrim.remove(); }
    function onKey(ev) { if (ev.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } }
    document.addEventListener("keydown", onKey);

    function pick(cli, btn) {
      chosen = cli;
      [].forEach.call(list.querySelectorAll(".cli-opt"), function (b) { b.classList.remove("sel"); });
      btn.classList.add("sel");
      custom.style.display = cli.cliType === "text" ? "grid" : "none";
      modelList.textContent = "";
      (cli.models || []).forEach(function (m) { modelList.appendChild(h("option", { value: m })); });
      modelInput.value = (cli.models && cli.models[0]) || "";
      modelInput.placeholder = cli.modelHint || "model id";
      if (!nameInput.value || nameInput.dataset.auto) {
        var base = cli.cliType === "text" ? "custom" : cli.cliType === "codex" ? "chatgpt" : cli.cliType === "antigravity" ? "gemini" : cli.cliType;
        var taken = state.config.agents.map(function (a) { return a.id; });
        var name = base; var n = 2;
        while (taken.indexOf(name) >= 0) name = base + "-" + n++;
        nameInput.value = name; nameInput.dataset.auto = "1";
      }
      save.disabled = false;
    }
    nameInput.addEventListener("input", function () { delete nameInput.dataset.auto; });

    api("/api/clis?list=1").then(function (data) {
      list.textContent = "";
      var installed = data.clis.filter(function (c) { return c.installed; });
      installed.forEach(function (cli) {
        var t = THEMES[cli.cliType] || { glyph: cli.label[0], color: "#555", soft: "#eee" };
        var b = h("button", { class: "cli-opt", type: "button" },
          h("span", { class: "mark", style: t.gradient ? "background:linear-gradient(135deg," + t.gradient.join(",") + ");color:#fff" : t.mono ? "background:#111;color:#fff" : "background:" + t.soft + ";color:" + t.color, text: t.glyph }),
          h("span", null, cli.label, h("small", { text: (cli.models.length ? cli.models.length + " models · " : "") + cli.path })),
          cli.note ? h("span", { class: "pill revise pick", title: cli.note, text: "note" }) : null);
        b.addEventListener("click", function () { pick(cli, b); });
        list.appendChild(b);
      });
      var other = h("button", { class: "cli-opt", type: "button" }, h("span", { class: "mark", style: "background:var(--soft)", text: "+" }),
        h("span", null, "Other CLI", h("small", { text: "Any command that reads a prompt and prints an answer" })));
      other.addEventListener("click", function () { pick({ cliType: "text", models: [] }, other); });
      list.appendChild(other);
      var missing = data.clis.filter(function (c) { return !c.installed; });
      if (missing.length) {
        var d = h("details", { class: "more", style: "margin-top:6px" }, h("summary", { text: "Not installed (" + missing.length + ")" }));
        missing.forEach(function (c) { d.appendChild(h("p", { class: "hint", style: "margin-top:6px" }, h("b", { text: c.label + ": " }), c.install)); });
        list.appendChild(d);
      }
    }).catch(function (e) { list.textContent = ""; list.appendChild(h("p", { class: "err", text: e.message })); });

    save.addEventListener("click", function () {
      if (!chosen) return;
      err.hidden = true;
      var body = { id: nameInput.value.trim(), cliType: chosen.cliType, model: modelInput.value.trim() };
      if (chosen.path) body.command = chosen.path;
      if (chosen.cliType === "text") {
        body.command = cmdInput.value.trim();
        body.args = argsInput.value.trim() ? argsInput.value.trim().split(/\s+/) : [];
      }
      save.disabled = true;
      api("/api/seats", { method: "POST", body: body }).then(function () {
        close();
        return loadConfig().then(loadUsage);
      }).catch(function (e) { err.hidden = false; err.textContent = e.message; save.disabled = false; });
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
      var box = document.getElementById("runs");
      box.textContent = "";
      if (data.runs.length === 0) box.appendChild(h("p", { class: "hint", text: "No debates yet." }));
      data.runs.forEach(function (run) {
        var cached = state.cache[run.requestId];
        var title = run.title || run.prompt || (run.process && run.process.task) || (cached && cached.model.task) || "Debate in progress";
        box.appendChild(h("button", { class: "run-item" + (state.selected === run.requestId ? " active" : ""), onclick: function () { select(run.requestId); } },
          h("span", { class: "t", text: title }),
          h("span", { class: "m" }, statusPill(runStatus(run)), fmtWhen(run.requestId), run.elapsedMs ? " · " + fmtElapsed(run.elapsedMs) : "")));
      });
    }).catch(function () {});
  }

  // ---------- selected run ----------
  function select(requestId) {
    state.selected = requestId;
    if (!state.cache[requestId]) state.cache[requestId] = { events: [], nextSeq: 0, result: null, error: null, process: null, model: emptyModel() };
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
      c.model = buildModel(c.events, c.result);
      render();
      if (!isDone(c)) state.pollTimer = setTimeout(poll, 1500);
      else { refreshRuns(); loadUsage(); }
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
    var main = document.getElementById("main");
    var scrollY = window.scrollY;
    var openDetails = {};
    [].forEach.call(main.querySelectorAll("details[data-key]"), function (d) { openDetails[d.getAttribute("data-key")] = d.open; });
    var banner = document.getElementById("stale-banner");
    main.textContent = "";
    if (banner) main.appendChild(banner);

    var run = state.runs.filter(function (r) { return r.requestId === state.selected; })[0];
    var status = result ? result.status : m.failed || c.error ? "failed" : run ? runStatus(run) : "in_progress";
    var title = result && result.task ? result.task.title || result.task.prompt :
      (run && (run.title || run.prompt)) || (c.process && c.process.task) || "Debate";
    var running = c.process && c.process.state === "running";

    main.appendChild(h("div", { class: "head" },
      h("h1", { text: title }),
      result && result.task && result.task.title && result.task.prompt !== result.task.title ? h("p", { class: "prompt", text: result.task.prompt }) : null,
      h("div", { class: "meta" }, statusPill(status),
        m.participants.map(function (id) { return h("span", { class: "chip" }, mark(id), id, m.eliminated[id] ? " (out)" : ""); }),
        result && result.metrics ? h("span", { text: fmtElapsed(result.metrics.elapsedMs) + " · " + result.metrics.totalRounds + " rounds" }) : null,
        h("span", { class: "mono", text: fmtWhen(state.selected) })),
      running ? h("div", null, h("button", { class: "btn danger small", onclick: stopRun }, "Stop debate")) : null
    ));

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

  function setAllRounds(open) {
    [].forEach.call(document.querySelectorAll("details.round"), function (d) { d.open = open; });
  }

  function renderVerdict(result, m, openDetails) {
    var report = result.report || {};
    var card = h("div", { class: "card verdict " + result.status },
      h("div", { class: "meta" }, statusPill(result.status),
        result.representative ? h("span", null, "Written by ", h("b", { style: "color:var(--ink)", text: result.representative.participantId }), ", the top peer score") : null),
      report.finalSummary ? h("p", { class: "big", text: report.finalSummary }) : null);
    if (report.representativeSpeech) {
      var d = h("details", { class: "more", "data-key": "speech" }, h("summary", { text: "Read the full report" }), h("p", { class: "prose", text: report.representativeSpeech }));
      d.open = !!openDetails.speech;
      card.appendChild(h("div", { style: "margin-top:12px" }, d));
    }
    if (result.disagreements && result.disagreements.length) {
      card.appendChild(h("div", { class: "block-label", text: "Open disagreements" }));
      result.disagreements.forEach(function (dg) { card.appendChild(h("p", { class: "rationale", text: (dg.claimId ? claimLabel(m, dg.claimId) + ": " : "") + (dg.reason || JSON.stringify(dg)) })); });
    }
    if (result.eliminations && result.eliminations.length) {
      card.appendChild(h("div", { class: "block-label", text: "Seats that dropped out" }));
      result.eliminations.forEach(function (el) { card.appendChild(h("p", { class: "rationale", text: el.participantId + " in round " + el.round + " (" + el.reason + ")" })); });
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
      return h("span", { class: "seat-chip " + st }, mark(pid), pid,
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
      h("div", { class: "lane-head" }, mark(pid), h("b", { text: pid }), h("span", { class: "model", text: agentModel(pid) }),
        !resp ? null : resp.eliminated ? h("span", { class: "pill eliminated", text: "dropped: " + resp.reason }) : null));
    if (!resp) { lane.appendChild(h("p", { class: "waiting" }, h("span", { class: "dot" }), "thinking…")); return lane; }
    if (resp.eliminated) { lane.appendChild(h("p", { class: "mono", text: String(resp.error || "no details") })); return lane; }

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
          h("div", { class: "by" }, "proposed by ", (fc.proposedBy || []).join(", "))),
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
    if (!confirm("Stop this debate? The agents will be stopped and no result will be written.")) return;
    api("/api/runs/" + encodeURIComponent(state.selected) + "/stop", { method: "POST" }).then(poll).catch(function (e) { alert(e.message); });
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
    var t = THEMES[seat.cliType] || { name: seat.cliType, color: "#555", soft: "#e8e8e8", glyph: "●" };
    var gid = "g-" + seat.cliType;
    var defs = t.gradient ? svg("defs", {}, svg("linearGradient", { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" },
      svg("stop", { offset: "0", "stop-color": t.gradient[0] }), svg("stop", { offset: ".55", "stop-color": t.gradient[1] }), svg("stop", { offset: "1", "stop-color": t.gradient[2] }))) : null;
    var stroke = t.gradient ? "url(#" + gid + ")" : t.color;
    var track = svg("circle", { class: "track", cx: 30, cy: 30, r: R, stroke: t.soft });
    var fill = svg("circle", { class: "fill", cx: 30, cy: 30, r: R, stroke: stroke, "stroke-dasharray": C, "stroke-dashoffset": C, transform: "rotate(-90 30 30)" });
    var orbit = svg("circle", { class: "orbit", cx: 30, cy: 30, r: R, stroke: stroke, "stroke-dasharray": "10 " + (C - 10), opacity: ".9" });
    orbit.style.display = "none";
    var inner = t.mono ? svg("circle", { cx: 30, cy: 30, r: 17, fill: "#111" }) : null;
    var glyph = svg("text", { x: 30, y: 31, "text-anchor": "middle", "dominant-baseline": "middle", class: "glyph",
      fill: t.mono ? "#fff" : t.gradient ? "url(#" + gid + ")" : t.color });
    glyph.textContent = t.glyph;
    var num = h("span", { class: "num" });
    var who = h("span", { class: "who" });
    var tip = h("div", { class: "tip" });
    var el = h("div", { class: "pod", tabindex: "0" }, svg("svg", { class: "ring", viewBox: "0 0 60 60" }, defs, track, fill, orbit, inner, glyph), num, who, tip);
    return { el: el, fill: fill, orbit: orbit, glyph: glyph, num: num, who: who, tip: tip, theme: t, inner: inner };
  }
  function updatePod(pod, seat) {
    var u = seat.usage; var t = pod.theme;
    pod.who.textContent = seat.agents.join(", ");
    pod.tip.textContent = "";
    pod.tip.appendChild(h("b", { text: t.name }));
    var pct = null;
    if (u.kind === "limits") {
      // Like Claude Code's ring: fill shows the shortest window, the one you hit first.
      pct = u.windows.length ? u.windows[0].usedPercent : 0;
      pod.num.textContent = Math.round(pct) + "%";
      pod.num.appendChild(h("small", { text: " used" }));
      u.windows.forEach(function (w) {
        pod.tip.appendChild(h("div", { class: "w" }, h("span", { text: w.label + " limit" }), h("span", { text: Math.round(100 - w.usedPercent) + "% left" }),
          h("small", { text: fmtReset(w.resetsAt) })));
      });
      pod.tip.appendChild(h("div", { class: "muted", text: (u.source === "claude" ? "Reported by Claude with its last answer" : "Read from Codex's own log") + (u.observedAt ? ", " + fmtAgo(u.observedAt) : "") + ". Shared with everything else you use this plan for." }));
    } else if (u.kind === "tokens") {
      pod.num.textContent = fmtTokens(u.totalTokens);
      pod.num.appendChild(h("small", { text: " tokens" }));
      pod.tip.appendChild(h("div", { text: "argue used " + u.totalTokens.toLocaleString() + " tokens today across " + u.calls + " call" + (u.calls === 1 ? "" : "s") + "." }));
      pod.tip.appendChild(h("div", { class: "muted", text: "Antigravity only shows its quota inside the Antigravity app (model picker). It doesn't share it with command-line tools, so there's no % ring here. This quota is separate from the Gemini app's daily limit." }));
    } else {
      pod.num.textContent = "—";
      pod.tip.appendChild(h("div", { class: "muted", text: u.reason }));
    }
    var mono = t.mono && pct !== null;
    if (pod.inner) pod.inner.style.display = mono ? "" : "none";
    pod.glyph.setAttribute("fill", mono ? "#fff" : t.gradient ? "url(#g-" + seat.cliType + ")" : t.color);
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
  function loadUsage() {
    if (state.closed) return Promise.resolve();
    return api("/api/usage").then(function (data) {
      var box = document.getElementById("usage");
      var seen = {};
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
    if (running && !confirm("A debate is still running. Quitting stops it too. Quit?")) return;
    api("/api/shutdown", { method: "POST" }).then(showClosed).catch(showClosed);
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
    var main = document.getElementById("main");
    main.insertBefore(banner, main.firstChild);
  }

  if (!token) {
    document.getElementById("main").textContent = "Missing access token. Open the desk from its shortcut or the link printed by argue ui.";
    return;
  }
  loadConfig().then(function () { loadUsage(); return refreshRuns(); }).then(function () { if (state.runs[0]) select(state.runs[0].requestId); });
  setInterval(function () { if (!state.closed) refreshRuns(); }, 5000);
  setInterval(loadUsage, 30000);
})();
</script>
</body>
</html>
`;
