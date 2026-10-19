import { knotSvg, themeForSeat, type SeatTheme } from "./themes.js";

/**
 * A finished debate as one standalone HTML document (no external assets). `reasoning: false`
 * gives the short version used for report.pdf (verdict, report, claims, scores);
 * `reasoning: true` adds every round, folded, for report.html. All debate text is escaped.
 */

type Judgement = {
  claimId?: string;
  stance?: string;
  confidence?: number;
  rationale?: string;
  revisedStatement?: string;
};
type Vote = { claimId?: string; vote?: string; reason?: string };
type Output = {
  participantId?: string;
  phase?: string;
  round?: number;
  summary?: string;
  fullResponse?: string;
  extractedClaims?: Array<{ title?: string; statement?: string; category?: string }>;
  judgements?: Judgement[];
  claimVotes?: Vote[];
};
type Result = {
  requestId?: string;
  status?: string;
  task?: { prompt?: string; title?: string };
  finalClaims?: Array<{
    claimId: string;
    title?: string;
    statement?: string;
    status?: string;
    mergedInto?: string;
    proposedBy?: string[];
  }>;
  claimResolutions?: Array<{
    claimId: string;
    status?: string;
    acceptCount?: number;
    rejectCount?: number;
    totalVoters?: number;
  }>;
  representative?: { participantId?: string };
  scoreboard?: Array<{ participantId: string; total: number; breakdown?: Record<string, number> }>;
  report?: { finalSummary?: string; representativeSpeech?: string };
  rounds?: Array<{ round: number; outputs?: Output[] }>;
  metrics?: { elapsedMs?: number; totalRounds?: number };
  eliminations?: Array<{ participantId?: string; round?: number; reason?: string }>;
};

export type ReportSeat = { id: string; model?: string; cli?: string };

const STATUS: Record<string, string> = {
  consensus: "Consensus",
  partial_consensus: "Partial consensus",
  unresolved: "Unresolved",
  interrupted: "Interrupted",
  failed: "Failed"
};

export function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!
  );
}

/**
 * Light Markdown for model text (headings, bold, italics, inline code, bullet and numbered
 * lines). The text is escaped first, so only the tags added here can appear in the output.
 */
export function mdToHtml(text: string): string {
  const inline = (s: string): string =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = (): void => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (heading) {
      close();
      out.push(`<h3>${inline(heading[1]!)}</h3>`);
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        close();
        // Keep the model's own numbering when bullets interrupt a numbered list.
        out.push(kind === "ol" ? `<ol start="${Number(numbered![1])}">` : "<ul>");
        list = kind;
      }
      out.push(`<li>${inline(bullet ? bullet[1]! : numbered![2]!)}</li>`);
    } else if (!line.trim()) {
      close();
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}

function markHtml(theme: SeatTheme | null, fallback: string): string {
  if (theme?.knot) {
    return `<span class="mark" style="background:${theme.tile}"><svg viewBox="0 0 24 24" width="13" height="13">${knotSvg("#fff")}</svg></span>`;
  }
  if (theme?.gradient) {
    return `<span class="mark" style="background:linear-gradient(135deg,${theme.gradient.join(",")});color:#fff">${esc(theme.glyph)}</span>`;
  }
  if (theme)
    return `<span class="mark" style="background:${theme.soft};color:${theme.color}">${esc(theme.glyph)}</span>`;
  return `<span class="mark" style="background:#eceef1;color:#5b6573">${esc(fallback.slice(0, 1).toUpperCase())}</span>`;
}

export function renderReportHtml(
  result: Result,
  options: { reasoning: boolean; seats?: ReportSeat[]; attachments?: string[]; savedAt?: Date }
): string {
  const seats = new Map((options.seats ?? []).map((s) => [s.id, s]));
  const themeOf = (id: string): SeatTheme | null => themeForSeat(seats.get(id)?.model, seats.get(id)?.cli);
  const chip = (id: string): string => `<span class="chip">${markHtml(themeOf(id), id)}${esc(id)}</span>`;
  const colorOf = (id: string): string => {
    const t = themeOf(id);
    return t?.gradient ? `linear-gradient(90deg,${t.gradient.join(",")})` : (t?.color ?? "#5b6573");
  };

  const claimTitles = new Map<string, string>();
  for (const round of result.rounds ?? []) {
    for (const out of round.outputs ?? []) {
      (out.extractedClaims ?? []).forEach((c, i) =>
        claimTitles.set(`${out.participantId}:${round.round}:${i}`, c.title ?? "")
      );
    }
  }
  for (const c of result.finalClaims ?? []) if (c.title) claimTitles.set(c.claimId, c.title);
  const claimName = (id: string | undefined): string => esc(claimTitles.get(id ?? "") || id || "");

  const title = result.task?.title || result.task?.prompt || "Debate";
  const participants = [...new Set((result.scoreboard ?? []).map((s) => s.participantId))];
  const resolutions = new Map((result.claimResolutions ?? []).map((r) => [r.claimId, r]));
  const date = (options.savedAt ?? new Date()).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const elapsed = result.metrics?.elapsedMs ? `${Math.round(result.metrics.elapsedMs / 1000)}s` : "";

  const claimsRows = [...(result.finalClaims ?? [])]
    .sort((a, b) => Number(a.status === "merged") - Number(b.status === "merged"))
    .map((c) => {
      const r = resolutions.get(c.claimId);
      const verdict =
        c.status === "merged"
          ? `<span class="pill">merged into ${claimName(c.mergedInto)}</span>`
          : r
            ? r.status === "resolved"
              ? `<span class="pill ok">accepted</span>`
              : `<span class="pill no">not agreed</span>`
            : "";
      const tally = r
        ? `<div class="by">${r.acceptCount ?? 0} accept · ${r.rejectCount ?? 0} reject of ${r.totalVoters ?? 0}</div>`
        : "";
      return `<tr class="${c.status === "merged" ? "merged" : ""}"><td><div class="ct">${esc(c.title)}</div><p>${esc(c.statement)}</p><div class="by">proposed by ${esc((c.proposedBy ?? []).join(", "))}</div></td><td class="tally">${verdict}${tally}</td></tr>`;
    })
    .join("");

  const scores = [...(result.scoreboard ?? [])]
    .sort((a, b) => b.total - a.total)
    .map((s) => {
      const rows = ["correctness", "completeness", "actionability", "consistency"]
        .filter((k) => typeof s.breakdown?.[k] === "number")
        .map((k) => {
          const v = Math.max(0, Math.min(100, s.breakdown![k]!));
          return `<div class="srow"><span>${k[0]!.toUpperCase()}${k.slice(1)}</span><span class="track"><i style="width:${v}%;background:${colorOf(s.participantId)}"></i></span><span>${Math.round(v)}</span></div>`;
        })
        .join("");
      return `<div class="score"><div class="stotal"><b>${s.total.toFixed(1)}</b>${chip(s.participantId)}</div>${rows}</div>`;
    })
    .join("");

  const rounds = options.reasoning
    ? (result.rounds ?? [])
        .map((round) => {
          const phase = round.outputs?.[0]?.phase;
          const name =
            phase === "initial" ? "Opening proposals" : phase === "final_vote" ? "Final vote" : "Cross-examination";
          const lanes = (round.outputs ?? [])
            .map((out) => {
              const id = out.participantId ?? "";
              const claims = (out.extractedClaims ?? [])
                .map((c) => `<div class="claim"><b>${esc(c.title)}</b><p>${esc(c.statement)}</p></div>`)
                .join("");
              const judgements = (out.judgements ?? [])
                .map(
                  (j) =>
                    `<div class="j ${esc(j.stance)}"><div><span class="pill ${j.stance === "agree" ? "ok" : j.stance === "disagree" ? "no" : "rev"}">${esc(j.stance)}</span> <b>${claimName(j.claimId)}</b> <span class="by">${Math.round((j.confidence ?? 0) * 100)}% sure</span></div>${j.rationale ? `<p>${esc(j.rationale)}</p>` : ""}${j.revisedStatement ? `<p class="rw"><b>Proposed wording:</b> ${esc(j.revisedStatement)}</p>` : ""}</div>`
                )
                .join("");
              const votes = (out.claimVotes ?? [])
                .map(
                  (v) =>
                    `<div class="j ${v.vote === "accept" ? "agree" : "disagree"}"><div><span class="pill ${v.vote === "accept" ? "ok" : "no"}">${esc(v.vote)}</span> <b>${claimName(v.claimId)}</b></div>${v.reason ? `<p>${esc(v.reason)}</p>` : ""}</div>`
                )
                .join("");
              return `<div class="lane" style="border-top-color:${themeOf(id)?.color ?? "#cfc8bb"}"><div class="lh">${chip(id)}</div>${out.summary ? `<p class="sum">${esc(out.summary)}</p>` : ""}${claims ? `<h4>Claims proposed</h4>${claims}` : ""}${judgements ? `<h4>How it judged the claims</h4>${judgements}` : ""}${votes ? `<h4>Votes</h4>${votes}` : ""}${out.fullResponse ? `<details><summary>Full answer</summary><div class="md">${mdToHtml(out.fullResponse)}</div></details>` : ""}</div>`;
            })
            .join("");
          return `<details class="round"><summary><b>Round ${round.round} · ${name}</b></summary><div class="lanes">${lanes}</div></details>`;
        })
        .join("")
    : "";

  const attachments = options.attachments?.length
    ? `<p class="meta">Attached: ${options.attachments.map((a) => esc(a)).join(", ")}</p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>${esc(title)} · argue</title>
<style>
:root{--ink:#1d1b18;--ink2:#3a3631;--muted:#7a736a;--line:#e6dfd3;--soft:#f1ece3;--serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
*{box-sizing:border-box}body{margin:0;background:#f6f2ea;color:var(--ink);font:15px/1.6 var(--sans)}
main{max-width:860px;margin:0 auto;padding:40px 28px 70px}
h1{font:600 30px/1.25 var(--serif);margin:0 0 8px}h2{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:32px 0 10px}
h4{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:12px 0 6px}
.meta{color:var(--muted);font-size:13px;margin:4px 0}.prompt{color:var(--ink2);white-space:pre-wrap;margin:6px 0 10px}
.chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 3px;border:1px solid var(--line);border-radius:999px;background:#fffdf9;font-weight:650;font-size:12.5px}
.mark{width:19px;height:19px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;font-weight:700}
.card{background:#fffdf9;border:1px solid var(--line);border-radius:14px;padding:18px 22px}
.verdict{border-left:5px solid #2f7d4a}.verdict.partial_consensus,.verdict.interrupted,.verdict.unresolved{border-left-color:#a8650a}.verdict.failed{border-left-color:#b93a32}
.big{font:400 19px/1.55 var(--serif);margin:8px 0 0}.pre{white-space:pre-wrap}.speech{font:400 15.5px/1.65 var(--serif);color:var(--ink2);white-space:pre-wrap}
.pill{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 9px;border-radius:999px;background:var(--soft);color:var(--muted)}
.pill.ok{background:#e5f2e8;color:#2f7d4a}.pill.no{background:#fbe9e7;color:#b93a32}.pill.rev{background:#fbf0dc;color:#a8650a}
table{width:100%;border-collapse:collapse;table-layout:fixed}td{padding:11px 14px;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}
td p{margin:3px 0 0;color:var(--ink2)}.ct{font:600 15px/1.35 var(--serif)}.by{font-size:11.5px;color:var(--muted);margin-top:3px}.tally{width:180px;text-align:right}tr.merged{opacity:.6}
.scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.score{background:#fffdf9;border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.stotal{display:flex;align-items:center;gap:10px;margin-bottom:6px}.stotal b{font:600 24px/1 var(--serif)}
.srow{display:grid;grid-template-columns:104px 1fr 26px;gap:8px;align-items:center;font-size:12.5px;margin:4px 0}.track{height:6px;background:var(--soft);border-radius:3px;overflow:hidden}.track i{display:block;height:100%}
details.round{background:#fffdf9;border:1px solid var(--line);border-radius:14px;margin-bottom:10px}details.round>summary{padding:12px 16px;cursor:pointer;font-family:var(--serif)}
.lanes{display:grid;gap:10px;padding:0 14px 14px}.lane{border:1px solid var(--line);border-top:4px solid;border-radius:12px;padding:12px 14px;background:#fff}
.lh{margin-bottom:6px}.sum{font-weight:600;color:var(--ink2);margin:4px 0}.claim{border:1px solid var(--line);border-radius:10px;padding:7px 10px;margin:5px 0;background:#fffcf7}.claim p{margin:2px 0 0}
.j{border-left:3px solid var(--line);padding:3px 0 5px 10px;margin:8px 0}.j.agree{border-left-color:#2f7d4a}.j.disagree{border-left-color:#b93a32}.j.revise{border-left-color:#a8650a}.j p{margin:3px 0 0}
.rw{background:#fbf0dc;border-radius:8px;padding:5px 9px}details>summary{cursor:pointer;font-weight:600;color:var(--ink2)}
.toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:10px 0;background:#f6f2ea}
.toolbar button{border:1px solid var(--line);background:#fffdf9;border-radius:9px;padding:6px 12px;font:600 13px var(--sans);cursor:pointer}
footer{margin-top:40px;color:var(--muted);font-size:12px}
.md{font:400 15.5px/1.65 var(--serif);color:var(--ink2)}.md h3{font:600 16px/1.35 var(--serif);color:var(--ink);margin:14px 0 4px}.md p{margin:6px 0}.md ul,.md ol{margin:6px 0;padding-left:22px}.md li{margin:3px 0}.md code{font:12.5px Consolas,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
@media print{body{background:#fff}.toolbar{display:none}.card,.score,details.round{break-inside:avoid}main{padding:0 6px}}
</style></head><body><main>
${options.reasoning ? `<div class="toolbar"><button onclick="document.querySelectorAll('details').forEach(function(d){d.open=true})">Expand all</button><button onclick="document.querySelectorAll('details').forEach(function(d){d.open=false})">Collapse all</button><button onclick="window.print()">Print / Save as PDF</button></div>` : ""}
<h1>${esc(title)}</h1>
${result.task?.title && result.task.prompt && result.task.prompt !== result.task.title ? `<p class="prompt">${esc(result.task.prompt)}</p>` : ""}
<div class="chips"><span class="pill ${result.status === "consensus" ? "ok" : result.status === "failed" ? "no" : "rev"}">${esc(STATUS[result.status ?? ""] ?? result.status)}</span>${participants.map(chip).join("")}</div>
<p class="meta">${esc(date)}${elapsed ? ` · ${esc(elapsed)}` : ""}${result.metrics?.totalRounds ? ` · ${result.metrics.totalRounds} rounds` : ""}</p>
${attachments}
<h2>Verdict</h2>
<div class="card verdict ${esc(result.status)}"><p class="meta">Written by <b>${esc(result.representative?.participantId)}</b>, the top peer score</p>${result.report?.finalSummary ? `<p class="big">${esc(result.report.finalSummary)}</p>` : ""}</div>
${result.report?.representativeSpeech ? `<h2>Full report</h2><div class="card md">${mdToHtml(result.report.representativeSpeech)}</div>` : ""}
${claimsRows ? `<h2>Claims and how they were resolved</h2><div class="card" style="padding:0"><table>${claimsRows}</table></div>` : ""}
${scores ? `<h2>Peer scores</h2><div class="scores">${scores}</div>` : ""}
${rounds ? `<h2>How they got there</h2>${rounds}` : options.reasoning ? "" : `<p class="meta" style="margin-top:28px">The round-by-round reasoning is in report.html next to this file.</p>`}
<footer>Saved by argue debate desk · ${esc(result.requestId)}</footer>
</main></body></html>`;
}
