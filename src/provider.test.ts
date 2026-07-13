import { describe, expect, it } from "vitest";
import {
  buildClaudeArgs,
  buildPiArgs,
  parseClaudeEnvelope,
  parsePiEnvelope,
  providerByName,
  wrapPiPrompt,
} from "./provider.js";

const schema = { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } };

describe("providerByName", () => {
  it("returns codex provider", () => {
    expect(providerByName("codex").name).toBe("codex");
  });

  it("returns claude provider", () => {
    expect(providerByName("claude").name).toBe("claude");
  });

  it("returns pi provider", () => {
    expect(providerByName("pi").name).toBe("pi");
  });

  it("returns mock providers", () => {
    expect(providerByName("mock").name).toBe("mock");
    expect(providerByName("mock-fail").name).toBe("mock-fail");
  });

  it("throws on unknown provider", () => {
    expect(() => providerByName("nope")).toThrow(/unsupported provider/u);
  });
});

describe("buildClaudeArgs", () => {
  it("constructs read-only invocation with model", () => {
    const args = buildClaudeArgs("/repo", schema, "sonnet", "read-only");
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--json-schema");
    expect(args).toContain(JSON.stringify(schema));
    expect(args).toContain("--add-dir");
    expect(args).toContain("/repo");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--tools");
    expect(args).toContain("Read,Glob,Grep");
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("constructs workspace-confined edit invocation without model", () => {
    const args = buildClaudeArgs("/repo", schema, null, "workspace-write");
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--tools");
    expect(args).toContain("Read,Glob,Grep,Edit,Write");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("acceptEdits");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--model");
  });
});

describe("parseClaudeEnvelope", () => {
  it("extracts the validated structured output", () => {
    const envelope = JSON.stringify({
      type: "result",
      is_error: false,
      result: "ordinary assistant text",
      structured_output: { ok: true },
    });
    expect(parseClaudeEnvelope(envelope)).toEqual({ ok: true });
  });

  it("throws on empty output", () => {
    expect(() => parseClaudeEnvelope("")).toThrow(/no output/u);
  });

  it("throws on non-JSON envelope", () => {
    expect(() => parseClaudeEnvelope("not json")).toThrow(/non-JSON envelope/u);
  });

  it("throws when is_error is true", () => {
    const envelope = JSON.stringify({ is_error: true, error: "boom" });
    expect(() => parseClaudeEnvelope(envelope)).toThrow(/boom/u);
  });

  it("throws when structured output is missing", () => {
    const envelope = JSON.stringify({ is_error: false, result: "ordinary assistant text" });
    expect(() => parseClaudeEnvelope(envelope)).toThrow(/missing structured_output/u);
  });
});

describe("buildPiArgs", () => {
  it("constructs read-only invocation with model", () => {
    const args = buildPiArgs("anthropic/sonnet", "read-only");
    expect(args).toContain("-p");
    expect(args).toContain("--mode");
    expect(args).toContain("json");
    expect(args).toContain("--no-session");
    expect(args).toContain("--model");
    expect(args).toContain("anthropic/sonnet");
    expect(args).toContain("-t");
    expect(args).toContain("read,grep,find,ls");
  });

  it("constructs workspace-write invocation without tool restriction", () => {
    const args = buildPiArgs(null, "workspace-write");
    expect(args).not.toContain("-t");
    expect(args).not.toContain("--model");
  });
});

describe("wrapPiPrompt", () => {
  it("appends schema instruction", () => {
    const wrapped = wrapPiPrompt("review this", schema);
    expect(wrapped).toContain("review this");
    expect(wrapped).toContain("JSON Schema");
    expect(wrapped).toContain(JSON.stringify(schema));
  });
});

describe("parsePiEnvelope", () => {
  it("parses single JSON object payload", () => {
    expect(parsePiEnvelope(JSON.stringify({ ok: true }))).toEqual({ ok: true });
  });

  it("extracts text field from assistant envelope", () => {
    const event = JSON.stringify({ role: "assistant", text: JSON.stringify({ ok: true }) });
    expect(parsePiEnvelope(event)).toEqual({ ok: true });
  });

  it("scans last assistant line in streamed output", () => {
    const events = [
      JSON.stringify({ role: "system", text: "boot" }),
      JSON.stringify({ role: "assistant", text: JSON.stringify({ ok: true }) }),
    ].join("\n");
    expect(parsePiEnvelope(events)).toEqual({ ok: true });
  });

  it("extracts the nested assistant message from Pi v3 events", () => {
    const events = [
      JSON.stringify({ type: "session", version: 3 }),
      JSON.stringify({ type: "message_end", message: { role: "user", content: [] } }),
      JSON.stringify({
        type: "turn_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        },
      }),
    ].join("\n");
    expect(parsePiEnvelope(events)).toEqual({ ok: true });
  });

  it("strips ```json fences", () => {
    const event = JSON.stringify({
      role: "assistant",
      text: "```json\n" + JSON.stringify({ ok: true }) + "\n```",
    });
    expect(parsePiEnvelope(event)).toEqual({ ok: true });
  });

  it("strips bare ``` fences", () => {
    const event = JSON.stringify({
      role: "assistant",
      text: "```\n" + JSON.stringify({ ok: true }) + "\n```",
    });
    expect(parsePiEnvelope(event)).toEqual({ ok: true });
  });

  it("throws on empty output", () => {
    expect(() => parsePiEnvelope("")).toThrow(/no output/u);
  });

  it("throws on non-JSON payload", () => {
    expect(() => parsePiEnvelope("definitely not json")).toThrow(/non-JSON payload/u);
  });
});
