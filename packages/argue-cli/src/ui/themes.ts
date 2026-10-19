/**
 * Seat themes: one color + mark per model family or CLI, shared by the debate desk, saved
 * reports and the exported icon set (assets/seat-icons). These are simple generic marks in
 * each family's well-known colors, not official logos; the names belong to their owners.
 *
 * A seat is themed by its model family first (an Antigravity seat running claude-opus-* looks
 * like Claude), then by its CLI, then by a neutral fallback.
 */
export type SeatTheme = {
  id: string;
  name: string;
  /** Main color (ring stroke, accents). */
  color: string;
  /** Pale tint (ring track, chip background). */
  soft: string;
  /** Text mark, or `knot` for the drawn ChatGPT mark. */
  glyph?: string;
  knot?: boolean;
  /** Dark tile behind light marks (chips). */
  tile?: string;
  /** Gradient stops for families with a gradient identity. */
  gradient?: string[];
  /** Lower-case regex source matched against the model id. */
  models?: string;
  /** CLI types / commands this theme applies to when the model says nothing. */
  clis?: string[];
};

export const SEAT_THEMES: SeatTheme[] = [
  {
    id: "claude",
    name: "Claude",
    color: "#D97757",
    soft: "#fbeae2",
    glyph: "✻",
    models: "claude|opus|sonnet|haiku|fable",
    clis: ["claude"]
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    color: "#1f1f1f",
    soft: "#e9e8e6",
    knot: true,
    tile: "#141414",
    models: "^gpt|^o[1-9]|codex|chatgpt",
    clis: ["codex"]
  },
  {
    id: "gemini",
    name: "Gemini",
    color: "#7b6fd8",
    soft: "#ecebfb",
    glyph: "✦",
    gradient: ["#4285F4", "#9B72CB", "#D96570"],
    models: "gemini|gemma",
    clis: ["antigravity", "gemini"]
  },
  { id: "meta", name: "Meta Llama", color: "#0866FF", soft: "#e3eeff", glyph: "∞", models: "llama|meta" },
  {
    id: "mistral",
    name: "Mistral",
    color: "#FA520F",
    soft: "#fff0e6",
    glyph: "▚",
    gradient: ["#FFD800", "#FF8205", "#FA500F", "#E10500"],
    models: "mistral|mixtral|codestral|devstral|magistral|ministral|pixtral",
    clis: ["vibe"]
  },
  { id: "qwen", name: "Qwen", color: "#615CED", soft: "#ecebfd", glyph: "◈", models: "qwen|qwq", clis: ["qwen"] },
  { id: "deepseek", name: "DeepSeek", color: "#4D6BFE", soft: "#e7ecff", glyph: "◗", models: "deepseek" },
  { id: "grok", name: "Grok", color: "#2b2b2b", soft: "#ececec", glyph: "⨯", tile: "#111111", models: "grok" },
  {
    id: "kimi",
    name: "Kimi",
    color: "#1f2937",
    soft: "#e8eaee",
    glyph: "☾",
    tile: "#111827",
    models: "kimi|moonshot",
    clis: ["kimi"]
  },
  { id: "copilot", name: "GitHub Copilot", color: "#8250DF", soft: "#efe9fb", glyph: "◉", clis: ["copilot"] },
  {
    id: "cursor",
    name: "Cursor",
    color: "#2d2d2d",
    soft: "#ebebeb",
    glyph: "⬢",
    tile: "#111111",
    clis: ["cursor-agent", "agent"]
  },
  { id: "ollama", name: "Ollama", color: "#3a3a3a", soft: "#ededed", glyph: "◔", clis: ["ollama"] },
  { id: "goose", name: "Goose", color: "#2f3b4a", soft: "#e8ebef", glyph: "◒", clis: ["goose"] },
  { id: "aider", name: "Aider", color: "#14A33C", soft: "#e4f5e9", glyph: "✎", clis: ["aider"] },
  { id: "llm", name: "llm", color: "#5b6573", soft: "#eceef1", glyph: "›", clis: ["llm"] },
  { id: "opencode", name: "opencode", color: "#3b3b3b", soft: "#ececec", glyph: "▣", clis: ["opencode"] },
  { id: "amp", name: "Amp", color: "#E5484D", soft: "#fde8e8", glyph: "ϟ", clis: ["amp"] },
  { id: "droid", name: "Factory droid", color: "#e05d2a", soft: "#fdebe3", glyph: "◇", clis: ["droid"] },
  { id: "pi", name: "pi", color: "#0f766e", soft: "#e0f2f0", glyph: "π", clis: ["pi"] }
];

/** Picks the theme for a seat from its model id and CLI (type or command name). */
export function themeForSeat(model: string | undefined, cli: string | undefined): SeatTheme | null {
  const m = (model ?? "").toLowerCase();
  if (m) {
    for (const theme of SEAT_THEMES) if (theme.models && new RegExp(theme.models).test(m)) return theme;
  }
  const c = (cli ?? "").toLowerCase();
  return SEAT_THEMES.find((theme) => theme.clis?.includes(c)) ?? null;
}

/** The ChatGPT knot: six rounded links turned 60 degrees apart, in a 24x24 box. */
export function knotSvg(color: string): string {
  return Array.from(
    { length: 6 },
    (_, k) =>
      `<rect x="9.1" y="2.6" width="5.8" height="12" rx="2.9" fill="none" stroke="${color}" stroke-width="1.7" transform="rotate(${k * 60} 12 12)"/>`
  ).join("");
}

/** A standalone ring icon (the desk's usage-ring look) for a theme, as an SVG document. */
export function seatIconSvg(theme: SeatTheme, size = 64): string {
  const gradientId = `g-${theme.id}`;
  const stroke = theme.gradient ? `url(#${gradientId})` : theme.color;
  const defs = theme.gradient
    ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">${theme.gradient
        .map(
          (c, i) =>
            `<stop offset="${theme.gradient!.length === 1 ? 0 : i / (theme.gradient!.length - 1)}" stop-color="${c}"/>`
        )
        .join("")}</linearGradient></defs>`
    : "";
  const mark = theme.knot
    ? `<g transform="translate(18.6 18.6) scale(.95)">${knotSvg(theme.color)}</g>`
    : `<text x="30" y="31" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI Symbol, Segoe UI, Apple Symbols, Noto Sans Symbols 2, sans-serif" font-size="18" font-weight="600" fill="${stroke}">${escapeXml(theme.glyph ?? "")}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="${size}" height="${size}" role="img" aria-label="${escapeXml(theme.name)}">`,
    defs,
    `<circle cx="30" cy="30" r="24" fill="#fffdf9" stroke="${theme.soft}" stroke-width="6"/>`,
    `<circle cx="30" cy="30" r="24" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-dasharray="113 151" transform="rotate(-90 30 30)"/>`,
    mark,
    `</svg>`
  ].join("");
}

function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!
  );
}
