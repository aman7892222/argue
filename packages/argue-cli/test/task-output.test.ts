import type { AgentTaskInput } from "@onevcat/argue";
import { describe, expect, it, vi } from "vitest";
import { parseJsonObject } from "../src/runtime/json.js";
import { normalizeTaskOutput, normalizeTaskOutputFromText } from "../src/runtime/task-output.js";

function makeInitialTask(): AgentTaskInput {
  return {
    kind: "round",
    sessionId: "s1",
    requestId: "r1",
    participantId: "a1",
    phase: "initial",
    round: 0,
    prompt: "p",
    claimCatalog: []
  };
}

function makeActionTask(): AgentTaskInput {
  return {
    kind: "action",
    sessionId: "s-action",
    requestId: "r-action",
    participantId: "a1",
    prompt: "do the thing",
    argueResult: {
      status: "consensus",
      finalSummary: "done",
      representativeSpeech: "ship it",
      claims: [],
      claimResolutions: [],
      scoreboard: []
    }
  };
}

describe("runtime/task-output", () => {
  it("wraps raw round content with task metadata", () => {
    const task = makeInitialTask();

    const output = normalizeTaskOutput(task, {
      fullResponse: "full",
      summary: "sum",
      taskTitle: "demo title",
      extractedClaims: [
        {
          title: "C1",
          statement: "claim"
        }
      ],
      judgements: []
    });

    expect(output.kind).toBe("round");
    if (output.kind !== "round") {
      throw new Error("expected round output");
    }

    expect(output.output.participantId).toBe("a1");
    expect(output.output.phase).toBe("initial");
    expect(output.output.round).toBe(0);
  });

  it("rejects wrapped round output when participant mismatches task", () => {
    const task = makeInitialTask();

    expect(() =>
      normalizeTaskOutput(task, {
        kind: "round",
        output: {
          participantId: "a2",
          phase: "initial",
          round: 0,
          fullResponse: "full",
          summary: "sum",
          taskTitle: "demo title",
          extractedClaims: [],
          judgements: []
        }
      })
    ).toThrow(/participant mismatch/);
  });

  it("parses fenced json text into normalized output", () => {
    const task = makeInitialTask();

    const output = normalizeTaskOutputFromText(
      task,
      '```json\n{"fullResponse":"full","summary":"sum","taskTitle":"demo title","extractedClaims":[],"judgements":[]}\n```'
    );

    expect(output.kind).toBe("round");
    if (output.kind === "round") {
      expect(output.output.summary).toBe("sum");
    }
  });

  it("keeps stray-quote rescue separate from round-schema enforcement", () => {
    const task = makeInitialTask();
    const parsed = parseJsonObject('{"fullResponse":"Hello"world","summary":"sum"}');

    expect(parsed).toEqual({
      fullResponse: 'Hello"world',
      summary: "sum"
    });
    expect(() => normalizeTaskOutput(task, parsed)).toThrow();
  });

  it("keeps a seat's answer when one judgement is malformed, and says what was set aside", () => {
    const task = { ...makeInitialTask(), phase: "debate", round: 2 } as AgentTaskInput;
    const good = { claimId: "c1", stance: "agree", confidence: 0.8, rationale: "holds up" };
    const logged: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      logged.push(String(chunk));
      return true;
    });
    try {
      const output = normalizeTaskOutput(task, {
        fullResponse: "full",
        summary: "sum",
        judgements: [good, { claimId: "c2", confidence: 0.4, rationale: "stance missing" }]
      });
      expect(output.kind === "round" && output.output.judgements).toEqual([good]);
      expect(logged.join("")).toMatch(/a1 \(round 2\): kept its answer, set aside judgements\[1\]: stance/);
      // With no usable judgement left the answer still fails, so the seat drops out as before.
      expect(() =>
        normalizeTaskOutput(task, { fullResponse: "f", summary: "s", judgements: [{ claimId: "c2" }] })
      ).toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps action output stable when already normalized", () => {
    const task = makeActionTask();

    const once = normalizeTaskOutputFromText(task, "action complete");
    const twice = normalizeTaskOutput(task, once);

    expect(once).toEqual({
      kind: "action",
      output: {
        fullResponse: "action complete",
        summary: "action complete"
      }
    });
    expect(twice).toEqual(once);
  });
});
