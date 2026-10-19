// The debate desk UI: one self-contained page (no external assets, no build step).
// Written with String.raw so regexes keep their backslashes; the client code below
// deliberately avoids backticks and "${" so nothing is interpolated by this module.
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
<style>
:root {
  --bg: #f6f5f1; --panel: #ffffff; --ink: #1f2328; --muted: #6b7078; --line: #e4e2dc;
  --soft: #f1efe9; --accent: #3b5bdb; --accent-soft: #e8edff;
  --agree: #2b8a3e; --agree-bg: #e6f4ea; --disagree: #c92a2a; --disagree-bg: #fdecec;
  --revise: #b26a00; --revise-bg: #fff3dc; --shadow: 0 1px 2px rgba(20,20,20,.05), 0 4px 14px rgba(20,20,20,.04);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
button, input, select, textarea { font: inherit; color: inherit; }
.app { display: grid; grid-template-columns: 340px 1fr; min-height: 100vh; }
aside { border-right: 1px solid var(--line); background: #fbfaf7; padding: 20px 18px; position: sticky; top: 0;
  height: 100vh; overflow-y: auto; }
main { padding: 26px 34px 80px; min-width: 0; }
.brand { display: flex; align-items: baseline; gap: 8px; margin-bottom: 18px; }
.brand b { font-size: 20px; letter-spacing: -.01em; }
.brand span { color: var(--muted); font-size: 13px; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 22px 0 10px; font-weight: 650; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
.form { padding: 14px; display: grid; gap: 12px; }
label.field { display: grid; gap: 5px; font-size: 13px; color: var(--muted); font-weight: 600; }
textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; }
textarea { min-height: 96px; resize: vertical; color: var(--ink); font-weight: 400; }
textarea:focus, select:focus { outline: 2px solid var(--accent-soft); border-color: var(--accent); }
.agents { display: grid; gap: 6px; }
.agent-opt { display: flex; align-items: center; gap: 9px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px;
  cursor: pointer; color: var(--ink); font-weight: 500; background: #fff; }
.agent-opt small { color: var(--muted); font-weight: 400; margin-left: auto; font-size: 12px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.btn { border: 0; border-radius: 9px; padding: 10px 14px; font-weight: 650; cursor: pointer; background: var(--accent); color: #fff; }
.btn:disabled { opacity: .55; cursor: default; }
.btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); font-weight: 550; padding: 7px 12px; }
.btn.danger { background: var(--disagree-bg); color: var(--disagree); }
.hint { font-size: 12px; color: var(--muted); margin: 0; }
.err { color: var(--disagree); font-size: 13px; margin: 0; white-space: pre-wrap; }
.runs { display: grid; gap: 6px; }
.run-item { text-align: left; border: 1px solid var(--line); border-radius: 9px; padding: 9px 11px; background: #fff; cursor: pointer; display: grid; gap: 3px; }
.run-item:hover { border-color: #cfccc3; }
.run-item.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.run-item .t { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-item .m { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
.pill { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 650; padding: 2px 9px; border-radius: 999px; background: var(--soft); color: var(--muted); }
.pill.consensus, .pill.accept, .pill.agree { background: var(--agree-bg); color: var(--agree); }
.pill.failed, .pill.reject, .pill.disagree, .pill.eliminated { background: var(--disagree-bg); color: var(--disagree); }
.pill.partial_consensus, .pill.interrupted, .pill.revise, .pill.stale, .pill.stopped { background: var(--revise-bg); color: var(--revise); }
.pill.in_progress, .pill.running { background: var(--accent-soft); color: var(--accent); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pill.running .dot, .pill.in_progress .dot, .waiting .dot { animation: pulse 1.2s infinite ease-in-out; }
@keyframes pulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
.empty { color: var(--muted); padding: 60px 10px; text-align: center; }
.empty b { color: var(--ink); display: block; font-size: 18px; margin-bottom: 6px; }
.head { display: grid; gap: 10px; margin-bottom: 22px; }
.head h1 { font-size: 24px; line-height: 1.3; margin: 0; letter-spacing: -.01em; }
.head .prompt { color: var(--muted); margin: 0; white-space: pre-wrap; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 4px; border-radius: 999px; background: #fff; border: 1px solid var(--line); font-weight: 600; color: var(--ink); font-size: 13px; }
.chip i { width: 18px; height: 18px; border-radius: 50%; display: inline-block; }
.section { margin-top: 28px; }
.section > h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 12px; font-weight: 700; }
.verdict { padding: 18px 20px; border-left: 4px solid var(--agree); }
.verdict.partial_consensus, .verdict.interrupted { border-left-color: var(--revise); }
.verdict.failed { border-left-color: var(--disagree); }
.verdict p.big { font-size: 17px; margin: 6px 0 0; }
details > summary { cursor: pointer; color: var(--accent); font-weight: 600; font-size: 13px; list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: "▸ "; }
details[open] > summary::before { content: "▾ "; }
.prose { white-space: pre-wrap; margin: 10px 0 0; }
.round { margin-bottom: 18px; }
.round-head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; }
.round-head b { font-size: 16px; }
.round-head span { color: var(--muted); font-size: 13px; }
.lanes { display: grid; gap: 12px; }
.lane { padding: 14px 16px; border-top: 4px solid var(--c, var(--line)); min-width: 0; }
.lane-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.lane-head b { font-size: 15px; }
.lane-head .model { color: var(--muted); font-size: 12px; }
.lane-head .pill { margin-left: auto; }
.summary { font-weight: 550; margin: 0 0 10px; }
.block-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; margin: 12px 0 6px; }
.claim { border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; margin-bottom: 6px; background: #fcfcfa; }
.claim .id { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 11.5px; color: var(--muted); }
.claim .title { font-weight: 650; }
.claim p { margin: 3px 0 0; font-size: 14px; }
.judgement { border-left: 3px solid var(--line); padding: 4px 0 6px 10px; margin-bottom: 10px; }
.judgement.agree { border-left-color: var(--agree); }
.judgement.disagree { border-left-color: var(--disagree); }
.judgement.revise { border-left-color: var(--revise); }
.j-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.target { font-weight: 600; }
.conf { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; margin-left: auto; }
.bar { width: 60px; height: 6px; border-radius: 3px; background: var(--soft); overflow: hidden; display: inline-block; }
.bar > i { display: block; height: 100%; background: var(--accent); }
.rationale { margin: 4px 0 0; font-size: 14px; }
.revised { margin: 5px 0 0; font-size: 14px; background: var(--revise-bg); border-radius: 7px; padding: 6px 9px; }
.revised b { color: var(--revise); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; }
.note { font-size: 13px; color: var(--muted); padding: 7px 11px; background: var(--soft); border-radius: 8px; margin: 8px 0 0; }
.waiting { color: var(--accent); display: flex; align-items: center; gap: 8px; font-size: 14px; }
.waiting .dot { background: var(--accent); }
.claims-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.claims-table td { padding: 10px 12px; border-top: 1px solid var(--line); vertical-align: top; }
.claims-table tr:first-child td { border-top: 0; }
.claims-table .stmt { margin: 3px 0 0; color: var(--ink); }
.claims-table .by { font-size: 12px; color: var(--muted); margin-top: 3px; }
.tally { white-space: nowrap; text-align: right; }
.score { padding: 14px 16px; display: grid; gap: 8px; }
.score-row { display: grid; grid-template-columns: 120px 1fr 52px; align-items: center; gap: 10px; font-size: 13px; }
.score-row .track { height: 8px; background: var(--soft); border-radius: 4px; overflow: hidden; }
.score-row .track i { display: block; height: 100%; border-radius: 4px; }
.score-total { display: flex; align-items: center; gap: 10px; }
.score-total b { font-size: 22px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; white-space: pre-wrap; color: var(--muted); }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 880px) {
  .app { grid-template-columns: 1fr; }
  aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  main { padding: 20px 16px 60px; }
}
@media (max-width: 640px) {
  .lanes { grid-template-columns: 1fr !important; }
}
</style>
</head>
<body>
<div class="app">
  <aside>
    <div class="brand"><b>argue</b><span>debate desk</span></div>
    <div class="card form" id="new-form">
      <label class="field">What should they debate?
        <textarea id="task" placeholder="e.g. Should a two-person startup build its MVP as a monolith or microservices?"></textarea>
      </label>
      <div class="field" style="display:grid;gap:5px;font-size:13px;color:var(--muted);font-weight:600">Seats
        <div class="agents" id="agents"></div>
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
      <p class="hint">Each seat runs its own CLI on your machine, using your existing logins.</p>
    </div>
    <h2>Debates</h2>
    <div class="runs" id="runs"><p class="hint">Loading…</p></div>
    <p class="hint" id="config-path" style="margin-top:14px;word-break:break-all"></p>
  </aside>
  <main id="main">
    <div class="empty"><b>Pick a debate or start a new one</b>Rounds appear here live as each agent answers.</div>
  </main>
</div>
<script>
(function () {
  "use strict";
  var token = (new URLSearchParams(location.hash.slice(1))).get("t") || "";
  var COLORS = ["#3b5bdb", "#e8590c", "#2b8a3e", "#ae3ec9", "#0c8599", "#c2255c"];
  var state = { config: null, runs: [], selected: null, cache: {}, pollTimer: null };

  function api(path, opts) {
    opts = opts || {};
    var headers = { "x-argue-token": token };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
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

  function colorFor(id) {
    var ids = state.selected && state.cache[state.selected] ? state.cache[state.selected].model.participants : [];
    var idx = ids.indexOf(id);
    if (idx < 0 && state.config) idx = state.config.agents.map(function (a) { return a.id; }).indexOf(id);
    return COLORS[(idx < 0 ? 0 : idx) % COLORS.length];
  }
  function agentModel(id) {
    var a = state.config ? state.config.agents.filter(function (x) { return x.id === id; })[0] : null;
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
    return m ? new Date(Number(m[1])).toLocaleString() : requestId;
  }

  // ---------- config + new debate form ----------
  function loadConfig() {
    return api("/api/config").then(function (cfg) {
      state.config = cfg;
      document.getElementById("config-path").textContent = "Config: " + cfg.configPath;
      var box = document.getElementById("agents");
      box.textContent = "";
      cfg.agents.forEach(function (a, i) {
        var cb = h("input", { type: "checkbox", value: a.id });
        cb.checked = cfg.defaults.agents.indexOf(a.id) >= 0;
        box.appendChild(h("label", { class: "agent-opt" }, cb,
          h("i", { style: "width:10px;height:10px;border-radius:50%;background:" + COLORS[i % COLORS.length] }),
          a.id, h("small", { text: a.provider + " · " + a.model })));
      });
      var rounds = document.getElementById("rounds");
      if (cfg.defaults.maxRounds >= 1 && cfg.defaults.maxRounds <= 5) rounds.value = String(cfg.defaults.maxRounds);
      var th = document.getElementById("threshold");
      var match = [].slice.call(th.options).filter(function (o) { return Number(o.value) === cfg.defaults.threshold; })[0];
      if (match) th.value = match.value;
    }).catch(function (e) { showFormError("Could not load config: " + e.message); });
  }
  function showFormError(msg) {
    var el = document.getElementById("form-error");
    el.hidden = !msg; el.textContent = msg || "";
  }
  document.getElementById("start").addEventListener("click", function () {
    var btn = this;
    var agents = [].slice.call(document.querySelectorAll("#agents input:checked")).map(function (c) { return c.value; });
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
    [].forEach.call(document.querySelectorAll(".run-item"), function (el) { el.classList.remove("active"); });
    refreshRuns();
    poll();
  }
  function poll() {
    clearTimeout(state.pollTimer);
    var id = state.selected;
    if (!id) return;
    var c = state.cache[id];
    api("/api/runs/" + encodeURIComponent(id) + "?since=" + c.nextSeq).then(function (data) {
      if (state.selected !== id) return;
      data.events.forEach(function (e) { c.events.push(e); c.nextSeq = Math.max(c.nextSeq, e.seq + 1); });
      c.result = data.result; c.error = data.error; c.process = data.process;
      c.model = buildModel(c.events, c.result);
      render();
      if (!isDone(c)) state.pollTimer = setTimeout(poll, 1500);
      else refreshRuns();
    }).catch(function () { state.pollTimer = setTimeout(poll, 3000); });
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

  function phaseName(r, isLastDebate) {
    if (r.phase === "initial") return ["Opening proposals", "Each seat answers independently, without seeing the others."];
    if (r.phase === "final_vote") return ["Final vote", "Each seat accepts or rejects every surviving claim."];
    return ["Cross-examination", "Each seat judges the others' claims: agree, disagree, or revise."];
  }

  // ---------- rendering ----------
  function render() {
    var c = state.cache[state.selected]; if (!c) return;
    var m = c.model; var result = c.result;
    var main = document.getElementById("main");
    var scrollY = window.scrollY;
    var openDetails = {};
    [].forEach.call(main.querySelectorAll("details[data-key]"), function (d) { openDetails[d.getAttribute("data-key")] = d.open; });
    main.textContent = "";

    var run = state.runs.filter(function (r) { return r.requestId === state.selected; })[0];
    var status = result ? result.status : m.failed || c.error ? "failed" : run ? runStatus(run) : "in_progress";
    var title = result && result.task ? result.task.title || result.task.prompt :
      (run && (run.title || run.prompt)) || (c.process && c.process.task) || "Debate";
    var running = c.process && c.process.state === "running";

    main.appendChild(h("div", { class: "head" },
      h("h1", { text: title }),
      result && result.task && result.task.title && result.task.prompt !== result.task.title ? h("p", { class: "prompt", text: result.task.prompt }) : null,
      h("div", { class: "meta" }, statusPill(status),
        m.participants.map(function (id) { return h("span", { class: "chip" }, h("i", { style: "background:" + colorFor(id) }), id, m.eliminated[id] ? " (out)" : ""); }),
        result && result.metrics ? h("span", { text: fmtElapsed(result.metrics.elapsedMs) + " · " + result.metrics.totalRounds + " rounds" }) : null,
        h("span", { class: "mono", text: state.selected })),
      running ? h("div", { class: "toolbar" }, h("button", { class: "btn danger", onclick: stopRun }, "Stop debate")) : null
    ));

    if (result) main.appendChild(renderVerdict(result, m, openDetails));
    if (c.error || m.failed) main.appendChild(h("div", { class: "card verdict failed" },
      h("b", { text: "The run failed" }), h("p", { class: "prose", text: JSON.stringify((c.error && (c.error.error || c.error)) || m.failed, null, 2) })));
    if (c.process && c.process.state === "exited" && c.process.exitCode !== 0 && !result && c.process.stderrTail.length)
      main.appendChild(h("div", { class: "card verdict failed", style: "margin-top:12px" }, h("b", { text: "Process output" }), h("p", { class: "mono", text: c.process.stderrTail.join("\n") })));

    var tl = h("div", { class: "section" }, h("h3", { text: "The debate, round by round" }));
    if (m.roundOrder.length === 0) tl.appendChild(h("p", { class: "waiting" }, h("span", { class: "dot" }), "Waiting for the first round to start…"));
    m.roundOrder.forEach(function (n) { tl.appendChild(renderRound(m.rounds[n], m, openDetails)); });
    if (m.report && !result) tl.appendChild(h("p", { class: "waiting" }, h("span", { class: "dot" }), m.report.reporterId + " is writing the final report…"));
    main.appendChild(tl);

    if (result) {
      main.appendChild(renderClaims(result, m));
      main.appendChild(renderScores(result));
    }
    window.scrollTo(0, scrollY);
  }

  function renderVerdict(result, m, openDetails) {
    var report = result.report || {};
    var box = h("div", { class: "section" }, h("h3", { text: "Verdict" }));
    var card = h("div", { class: "card verdict " + result.status },
      h("div", { class: "meta" }, statusPill(result.status),
        result.representative ? h("span", { text: "Report by " + result.representative.participantId + " (top peer score)" }) : null),
      report.finalSummary ? h("p", { class: "big", text: report.finalSummary }) : null);
    if (report.representativeSpeech) {
      var d = h("details", { "data-key": "speech" }, h("summary", { text: "Read the full report" }), h("p", { class: "prose", text: report.representativeSpeech }));
      d.open = !!openDetails.speech;
      card.appendChild(h("div", { style: "margin-top:10px" }, d));
    }
    if (result.disagreements && result.disagreements.length) {
      card.appendChild(h("div", { class: "block-label", text: "Open disagreements" }));
      result.disagreements.forEach(function (dg) { card.appendChild(h("p", { class: "rationale", text: (dg.claimId ? claimLabel(m, dg.claimId) + ": " : "") + (dg.reason || JSON.stringify(dg)) })); });
    }
    if (result.eliminations && result.eliminations.length) {
      card.appendChild(h("div", { class: "block-label", text: "Seats that dropped out" }));
      result.eliminations.forEach(function (el) { card.appendChild(h("p", { class: "rationale", text: el.participantId + " in round " + el.round + " (" + el.reason + ")" })); });
    }
    box.appendChild(card);
    return box;
  }

  function renderRound(r, m, openDetails) {
    var name = phaseName(r);
    var wrap = h("div", { class: "round" },
      h("div", { class: "round-head" }, h("b", { text: "Round " + r.round + " · " + name[0] }), h("span", { text: name[1] })));
    var lanes = h("div", { class: "lanes", style: "grid-template-columns: repeat(" + Math.max(1, r.participants.length) + ", minmax(0, 1fr))" });
    r.participants.forEach(function (pid) { lanes.appendChild(renderLane(r, pid, m, openDetails)); });
    wrap.appendChild(lanes);
    r.merges.forEach(function (mg) {
      wrap.appendChild(h("p", { class: "note", text: "Merged “" + claimLabel(m, mg.from) + "” (" + mg.from + ") into “" + claimLabel(m, mg.into) + "” (" + mg.into + ") — the seats judged them to say the same thing." }));
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
    var lane = h("div", { class: "card lane", style: "--c:" + colorFor(pid) },
      h("div", { class: "lane-head" }, h("b", { text: pid }), h("span", { class: "model", text: agentModel(pid) }),
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
      var d = h("details", { "data-key": key, style: "margin-top:10px" }, h("summary", { text: "Full answer" }), h("p", { class: "prose", text: resp.fullResponse }));
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
      table.appendChild(h("tr", null,
        h("td", null, h("div", { class: "title", style: "font-weight:650", text: fc.title }), h("p", { class: "stmt", text: fc.statement }),
          h("div", { class: "by", text: fc.claimId + " · proposed by " + (fc.proposedBy || []).join(", ") })),
        h("td", { class: "tally" }, label, cr ? h("div", { class: "by", text: cr.acceptCount + " accept · " + cr.rejectCount + " reject of " + cr.totalVoters }) : null)));
    });
    return h("div", { class: "section" }, h("h3", { text: "Claims and how they were resolved" }), h("div", { class: "card" }, table));
  }

  function renderScores(result) {
    var LABELS = { correctness: "Correctness", completeness: "Completeness", actionability: "Actionability", consistency: "Consistency" };
    var ranked = (result.scoreboard || []).slice().sort(function (a, b) { return b.total - a.total; });
    var grid = h("div", { class: "grid2" });
    ranked.forEach(function (s) {
      var card = h("div", { class: "card score", style: "border-top:4px solid " + colorFor(s.participantId) },
        h("div", { class: "score-total" }, h("b", { text: s.total.toFixed(1) }), h("span", { text: s.participantId })));
      Object.keys(LABELS).forEach(function (k) {
        var v = s.breakdown ? s.breakdown[k] : null;
        if (typeof v !== "number") return;
        card.appendChild(h("div", { class: "score-row" }, h("span", { text: LABELS[k] }),
          h("span", { class: "track" }, h("i", { style: "width:" + Math.max(0, Math.min(100, v)) + "%;background:" + colorFor(s.participantId) })),
          h("span", { style: "text-align:right", text: v.toFixed(0) })));
      });
      grid.appendChild(card);
    });
    return h("div", { class: "section" }, h("h3", { text: "Peer scores" }),
      h("p", { class: "hint", style: "margin:-6px 0 10px", text: "Seats score each other: correctness 35%, completeness 25%, actionability 25%, consistency 15%. The top scorer writes the report." }), grid);
  }

  function stopRun() {
    if (!confirm("Stop this debate? The agents will be terminated and no result will be written.")) return;
    api("/api/runs/" + encodeURIComponent(state.selected) + "/stop", { method: "POST" }).then(poll).catch(function (e) { alert(e.message); });
  }

  if (!token) {
    document.getElementById("main").textContent = "Missing access token. Open the link printed by argue ui.";
    return;
  }
  loadConfig().then(refreshRuns).then(function () { if (state.runs[0]) select(state.runs[0].requestId); });
  setInterval(refreshRuns, 5000);
})();
</script>
</body>
</html>
`;
