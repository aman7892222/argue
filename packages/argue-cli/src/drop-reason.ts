/**
 * Starts an error that means a seat's plan or quota ran out; the rest is the CLI's own words
 * ("You've hit your session limit · resets 6:40pm"). The desk shows these as "plan limit reached".
 */
export const PLAN_LIMIT_PREFIX = "plan_limit: ";

/** Why a seat dropped out, for people: "plan limit reached (You've hit your session limit · …)". */
export function describeDrop(reason: string | undefined, error?: string): string {
  // A delegate that throws instead of returning ok=false leaves an "Error: " in front.
  const text = error?.replace(/^Error: /, "");
  if (text?.startsWith(PLAN_LIMIT_PREFIX)) return `plan limit reached (${text.slice(PLAN_LIMIT_PREFIX.length)})`;
  if (reason === "timeout") return "did not answer in time";
  return reason ?? "dropped";
}
