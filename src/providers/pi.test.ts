import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommandArgs } from "../exec.js";
import { piProvider } from "./pi.js";

vi.mock("../exec.js", () => ({ runCommandArgs: vi.fn() }));

const output = { outcome: "fixed", reasoning: "verified", commands: [] };
const payload = JSON.stringify(output);
const options = { model: "anthropic/sonnet", reasoningEffort: null, skipGitRepoCheck: false };

beforeEach(() => {
  vi.mocked(runCommandArgs).mockReset();
});

describe("Pi output compatibility", () => {
  it.each([
    ["plain JSON", payload],
    ["legacy text", JSON.stringify({ role: "assistant", text: payload })],
    ["content text", JSON.stringify({ role: "assistant", content: payload })],
    ["result text", JSON.stringify({ result: payload })],
    ["message text", JSON.stringify({ message: payload })],
    [
      "fenced content blocks",
      JSON.stringify({
        role: "assistant",
        content: [{ type: "text", text: `\`\`\`json\n${payload}\n\`\`\`` }],
      }),
    ],
    [
      "Pi v3 stream",
      [
        JSON.stringify({ type: "session", version: 3 }),
        JSON.stringify({
          type: "message_end",
          message: { role: "assistant", content: [{ type: "text", text: '{"outcome":"open"}' }] },
        }),
        JSON.stringify({
          type: "turn_end",
          message: { role: "assistant", content: [{ type: "text", text: payload }] },
        }),
        JSON.stringify({ type: "agent_end" }),
      ].join("\n"),
    ],
  ])("validates %s through the provider", async (_name, stdout) => {
    vi.mocked(runCommandArgs).mockResolvedValue({
      command: "pi",
      cwd: "/repo",
      exitCode: 0,
      durationMs: 1,
      stdout,
      stderr: "",
    });

    await expect(piProvider.revalidate("/repo", "Check the fix.", options)).resolves.toEqual(
      output,
    );
    expect(runCommandArgs).toHaveBeenCalledWith(
      "pi",
      expect.arrayContaining([
        "--mode",
        "json",
        "--no-session",
        "--model",
        "anthropic/sonnet",
        "--tools",
        "read,grep,find,ls",
      ]),
      "/repo",
      undefined,
      expect.objectContaining({ trimOutput: false }),
    );
  });

  it("rejects invalid schema output inside an assistant event", async () => {
    vi.mocked(runCommandArgs).mockResolvedValue({
      command: "pi",
      cwd: "/repo",
      exitCode: 0,
      durationMs: 1,
      stdout: JSON.stringify({ role: "assistant", text: '{"outcome":"invalid"}' }),
      stderr: "",
    });
    await expect(piProvider.revalidate("/repo", "Check the fix.", options)).rejects.toThrow(
      /schema validation failed/u,
    );
  });
});
