#!/usr/bin/env node
// Writes the shared seat icon set from src/ui/themes.ts (build the CLI first):
//   packages/argue-cli/assets/seat-icons/<id>.svg, palette.json, README.md
// Usage: npm run build -w packages/argue-cli && node scripts/export-seat-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themesModule = join(root, "packages", "argue-cli", "dist", "ui", "themes.js");
const { SEAT_THEMES, seatIconSvg } = await import(pathToFileURL(themesModule).href);

const out = join(root, "packages", "argue-cli", "assets", "seat-icons");
await mkdir(out, { recursive: true });

for (const theme of SEAT_THEMES) {
  await writeFile(join(out, `${theme.id}.svg`), seatIconSvg(theme, 64) + "\n", "utf8");
}

const palette = SEAT_THEMES.map(({ id, name, color, soft, glyph, knot, tile, gradient, models, clis }) => ({
  id,
  name,
  color,
  soft,
  ...(glyph ? { glyph } : {}),
  ...(knot ? { mark: "knot" } : {}),
  ...(tile ? { tile } : {}),
  ...(gradient ? { gradient } : {}),
  ...(models ? { models } : {}),
  ...(clis ? { clis } : {})
}));
await writeFile(join(out, "palette.json"), JSON.stringify(palette, null, 2) + "\n", "utf8");

const rows = SEAT_THEMES.map(
  (t) =>
    `| <img src="${t.id}.svg" width="40" height="40" alt=""> | **${t.name}** | \`${t.color}\`${t.gradient ? ` (gradient ${t.gradient.map((c) => `\`${c}\``).join(" → ")})` : ""} | ${t.knot ? "drawn knot" : t.glyph} | ${t.models ? `\`${t.models}\`` : "—"} | ${t.clis ? t.clis.map((c) => `\`${c}\``).join(", ") : "—"} |`
).join("\n");

await writeFile(
  join(out, "README.md"),
  `# Seat icons

The marks the debate desk, saved reports and PDFs use for each seat. They are free to reuse in
any argue tool or fork (MIT, like the rest of this repo).

These are simple generic marks in each family's well-known colors, **not official logos**; the
product names and their trademarks belong to their owners.

How a seat gets its icon: the **model id** is matched first (so an Antigravity seat running
\`claude-opus-*\` shows the Claude mark), then the **CLI** it runs, then a neutral fallback.
To add a family, add an entry to \`packages/argue-cli/src/ui/themes.ts\` and run:

\`\`\`bash
npm run build -w packages/argue-cli && node scripts/export-seat-icons.mjs
\`\`\`

| Icon | Family | Color | Mark | Model ids matched | CLIs |
|---|---|---|---|---|---|
${rows}

\`palette.json\` has the same data for other tools.
`,
  "utf8"
);

console.log(`wrote ${SEAT_THEMES.length} icons to ${out}`);
