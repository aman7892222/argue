import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Writes a double-click launcher for the debate desk into `dir`: a .cmd on Windows, a
 * .command on macOS (opens in Terminal), a .sh on Linux. It runs `argue ui --exit-when-idle 3`
 * from that folder, so the desk stops by itself a few minutes after its page is closed.
 */
export async function writeDeskShortcut(dir: string, platform: NodeJS.Platform = process.platform): Promise<string> {
  // dist/ui/shortcut.js -> dist/cli.js
  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  const node = process.execPath;

  if (platform === "win32") {
    const path = join(dir, "Open Debate Desk.cmd");
    const lines = [
      "@echo off",
      "title argue debate desk - close this window to stop it",
      'cd /d "%~dp0"',
      "echo.",
      "echo   argue debate desk is opening in your browser.",
      "echo   It stops when you click Quit, close this window, or 3 minutes after the page is closed.",
      "echo.",
      `"${node}" "${cli}" ui --exit-when-idle 3`,
      "if errorlevel 1 pause",
      ""
    ];
    await writeFile(path, lines.join("\r\n"), "utf8");
    return path;
  }

  const path = join(dir, platform === "darwin" ? "Open Debate Desk.command" : "open-debate-desk.sh");
  const lines = [
    "#!/bin/sh",
    "# argue debate desk launcher. Double-click it (macOS opens it in Terminal).",
    'cd "$(dirname "$0")" || exit 1',
    `NODE="$(command -v node || echo ${shellQuote(node)})"`,
    'echo "argue debate desk is opening in your browser."',
    'echo "It stops when you click Quit, close this window, or 3 minutes after the page is closed."',
    `"$NODE" ${shellQuote(cli)} ui --exit-when-idle 3`,
    ""
  ];
  await writeFile(path, lines.join("\n"), "utf8");
  await chmod(path, 0o755);
  return path;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
