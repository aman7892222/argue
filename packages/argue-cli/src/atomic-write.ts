import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/**
 * Writes a text file so that readers never see it half-written: the text goes to a temporary
 * file beside it, which then replaces the original in one step.
 */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const temp = tempPathFor(path);
  await writeFile(temp, data, "utf8");
  await moveIntoPlace(temp, path);
}

/** A temporary file name beside `path`, for building a file before it replaces `path`. */
export function tempPathFor(path: string): string {
  return `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
}

/**
 * Replaces `path` with the finished temporary file `temp` in one step. Windows can briefly refuse
 * while another program (a virus scanner, a reader) has the file open, so that is retried; if it
 * still fails, the temporary file is removed and the error is passed on.
 */
export async function moveIntoPlace(temp: string, path: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(temp, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt < 6 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        continue;
      }
      await rm(temp, { force: true });
      throw error;
    }
  }
}
