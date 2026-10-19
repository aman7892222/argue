import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { LoadedCliConfig } from "../config.js";
import { REQUEST_ID_PATTERN } from "../request-id.js";
import { renderReportHtml, type ReportSeat } from "./report.js";

/**
 * The debate library: one folder per finished debate, in a place each user picks.
 *   <library>/<date> <title>/report.pdf   final output (verdict, report, claims, scores)
 *                            report.html  the same plus every round, folded; opens offline
 *                            debate.json  everything needed to reopen or rerun it in the desk
 */

export type LibraryEntry = {
  requestId: string;
  title: string;
  status: string;
  savedAt: string;
  folder: string;
  hasPdf: boolean;
};

export type SavedDebate = {
  version: 1;
  savedAt: string;
  seats: ReportSeat[];
  attachments: string[];
  result: Record<string, unknown> & { requestId?: string };
};

export function libraryDir(loaded: LoadedCliConfig): string {
  const dir = loaded.config.library?.dir;
  if (!dir) return join(loaded.configDir, "debates");
  return isAbsolute(dir) ? dir : resolve(loaded.configDir, dir);
}

/** A folder name every OS accepts: "2026-10-19 14.48 Weekend stack for a solo developer". */
export function debateFolderName(title: string, when: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}.${pad(when.getMinutes())}`;
  const clean = title
    // Characters Windows/macOS/Linux reject in file names, including control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70)
    .replace(/[. ]+$/, "");
  return `${stamp} ${clean || "debate"}`;
}

export async function listLibrary(dir: string): Promise<LibraryEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const entries: LibraryEntry[] = [];
  for (const name of names) {
    const folder = join(dir, name);
    const saved = await readSaved(folder);
    if (!saved) continue;
    const requestId = saved.result.requestId;
    if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) continue;
    const task = (saved.result.task ?? {}) as { title?: string; prompt?: string };
    entries.push({
      requestId,
      title: task.title || task.prompt || name,
      status: String(saved.result.status ?? "unknown"),
      savedAt: saved.savedAt,
      folder,
      hasPdf: await exists(join(folder, "report.pdf"))
    });
  }
  return entries.sort((a, b) => b.requestId.localeCompare(a.requestId));
}

export async function readSaved(folder: string): Promise<SavedDebate | null> {
  try {
    const parsed = JSON.parse(await readFile(join(folder, "debate.json"), "utf8")) as SavedDebate;
    return parsed && parsed.version === 1 && parsed.result && typeof parsed.result === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves (or refreshes) a debate in the library and returns its folder. */
export async function saveToLibrary(args: {
  dir: string;
  result: Record<string, unknown> & { requestId?: string };
  seats: ReportSeat[];
  attachments: string[];
  now?: Date;
  browser?: string | null;
}): Promise<{ folder: string; pdf: boolean }> {
  const requestId = String(args.result.requestId ?? "");
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("result has no valid requestId");
  const now = args.now ?? new Date();

  const existing = (await listLibrary(args.dir)).find((e) => e.requestId === requestId);
  const task = (args.result.task ?? {}) as { title?: string; prompt?: string };
  // Folders are named after when the debate happened (request ids start with its timestamp).
  const started = /^argue_(\d{10,})/.exec(requestId);
  const when = started ? new Date(Number(started[1])) : now;
  const folder = existing?.folder ?? join(args.dir, debateFolderName(task.title || task.prompt || "debate", when));
  if (!isInside(args.dir, folder)) throw new Error("refusing to write outside the library folder");
  await mkdir(folder, { recursive: true });

  const saved: SavedDebate = {
    version: 1,
    savedAt: now.toISOString(),
    seats: args.seats,
    attachments: args.attachments,
    result: args.result
  };
  await writeFile(join(folder, "debate.json"), `${JSON.stringify(saved, null, 2)}\n`, "utf8");
  await writeFile(
    join(folder, "report.html"),
    renderReportHtml(args.result as never, {
      reasoning: true,
      seats: args.seats,
      attachments: args.attachments,
      savedAt: when
    }),
    "utf8"
  );

  const browser = args.browser === undefined ? await findPdfBrowser() : args.browser;
  let pdf = false;
  if (browser) {
    const html = renderReportHtml(args.result as never, {
      reasoning: false,
      seats: args.seats,
      attachments: args.attachments,
      savedAt: when
    });
    pdf = await printToPdf(browser, html, join(folder, "report.pdf")).catch(() => false);
  }
  return { folder, pdf };
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Edge or Chrome, which every recent Windows/macOS install (and most Linux desktops) has. */
export async function findPdfBrowser(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const candidates =
    process.platform === "win32"
      ? [
          join(env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
          join(env.ProgramFiles ?? "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
          join(env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          join(env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe")
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium"
          ]
        : ["/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const path of candidates) if (path && (await exists(path))) return path;
  return null;
}

/** Renders HTML to PDF with a throwaway headless browser profile (the user's profile is never touched). */
async function printToPdf(browser: string, html: string, outPath: string): Promise<boolean> {
  const work = await mkdtemp(join(tmpdir(), "argue-pdf-"));
  try {
    const page = join(work, "report.html");
    await writeFile(page, html, "utf8");
    const ok = await new Promise<boolean>((done) => {
      const child = spawn(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--disable-sync",
          `--user-data-dir=${join(work, "profile")}`,
          "--no-pdf-header-footer",
          `--print-to-pdf=${outPath}`,
          pathToFileURL(page).href
        ],
        { stdio: "ignore", windowsHide: true }
      );
      const timer = setTimeout(() => child.kill(), 60_000);
      child.on("error", () => done(false));
      child.on("close", () => {
        clearTimeout(timer);
        done(true);
      });
    });
    // Edge's launcher can exit before the PDF is written, so wait for the file to appear and
    // stop growing before cleaning up the temporary profile it is still using.
    return ok && (await waitForStableFile(outPath, 30_000));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Shows a native "choose folder" dialog; resolves the chosen path, or null if cancelled/unavailable. */
export function chooseFolderDialog(): Promise<string | null> {
  const [command, args] =
    process.platform === "win32"
      ? [
          "powershell.exe",
          [
            "-NoProfile",
            "-STA",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; " +
              "$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose where argue saves your debates'; " +
              "$d.ShowNewFolderButton = $true; if ($d.ShowDialog($f) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }"
          ]
        ]
      : process.platform === "darwin"
        ? ["osascript", ["-e", 'POSIX path of (choose folder with prompt "Choose where argue saves your debates")']]
        : ["zenity", ["--file-selection", "--directory", "--title=Choose where argue saves your debates"]];
  return new Promise((done) => {
    let out = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: false });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => (out += chunk));
    child.on("error", () => done(null));
    child.on("close", () => {
      const path = out.trim();
      done(path ? path : null);
    });
  });
}

/** Opens a folder or file with the OS (Explorer / Finder / default app). */
export function openWithOs(path: string): void {
  const [command, args] =
    process.platform === "win32"
      ? ["explorer.exe", [path]]
      : process.platform === "darwin"
        ? ["open", [path]]
        : ["xdg-open", [path]];
  const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: false });
  child.on("error", () => {});
  child.unref();
}

async function waitForStableFile(path: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    const size = await stat(path).then(
      (s) => s.size,
      () => -1
    );
    if (size > 0 && size === lastSize) return true;
    lastSize = size;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
