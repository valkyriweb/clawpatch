import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandArgs } from "./exec.js";
import { ClawpatchError } from "./errors.js";
import {
  FixPlanOutput,
  ReviewOutput,
  RevalidateOutput,
  fixPlanOutputSchema,
  reviewOutputSchema,
  revalidateOutputSchema,
} from "./types.js";

export type Provider = {
  name: string;
  check(root: string): Promise<string>;
  review(root: string, prompt: string, model: string | null): Promise<ReviewOutput>;
  fix(root: string, prompt: string, model: string | null): Promise<FixPlanOutput>;
  revalidate(root: string, prompt: string, model: string | null): Promise<RevalidateOutput>;
};

export function providerByName(name: string): Provider {
  if (name === "codex") {
    return codexProvider;
  }
  if (name === "claude") {
    return claudeProvider;
  }
  if (name === "pi") {
    return piProvider;
  }
  if (name === "mock") {
    return mockProvider;
  }
  if (name === "mock-fail") {
    return mockFailProvider;
  }
  throw new ClawpatchError(`unsupported provider: ${name}`, 2, "unsupported-provider");
}

const codexProvider: Provider = {
  name: "codex",
  async check(root: string): Promise<string> {
    const result = await runCommandArgs("codex", ["--version"], root);
    if (result.exitCode !== 0) {
      throw new ClawpatchError("codex CLI not available", 4, "provider-auth");
    }
    return result.stdout.trim();
  },
  async review(root: string, prompt: string, model: string | null): Promise<ReviewOutput> {
    const output = await runCodexJson(root, prompt, model, reviewJsonSchema);
    return reviewOutputSchema.parse(output);
  },
  async fix(root: string, prompt: string, model: string | null): Promise<FixPlanOutput> {
    const output = await runCodexJson(root, prompt, model, fixPlanJsonSchema, "workspace-write");
    return fixPlanOutputSchema.parse(output);
  },
  async revalidate(root: string, prompt: string, model: string | null): Promise<RevalidateOutput> {
    const output = await runCodexJson(root, prompt, model, revalidateJsonSchema);
    return revalidateOutputSchema.parse(output);
  },
};

const claudeProvider: Provider = {
  name: "claude",
  async check(root: string): Promise<string> {
    const result = await runCommandArgs("claude", ["--version"], root);
    if (result.exitCode !== 0) {
      throw new ClawpatchError("claude CLI not available", 4, "provider-auth");
    }
    return result.stdout.trim();
  },
  async review(root: string, prompt: string, model: string | null): Promise<ReviewOutput> {
    const output = await runClaudeJson(root, prompt, model, reviewJsonSchema, "read-only");
    return reviewOutputSchema.parse(output);
  },
  async fix(root: string, prompt: string, model: string | null): Promise<FixPlanOutput> {
    const output = await runClaudeJson(root, prompt, model, fixPlanJsonSchema, "workspace-write");
    return fixPlanOutputSchema.parse(output);
  },
  async revalidate(root: string, prompt: string, model: string | null): Promise<RevalidateOutput> {
    const output = await runClaudeJson(root, prompt, model, revalidateJsonSchema, "read-only");
    return revalidateOutputSchema.parse(output);
  },
};

const piProvider: Provider = {
  name: "pi",
  async check(root: string): Promise<string> {
    const result = await runCommandArgs("pi", ["--version"], root);
    if (result.exitCode !== 0) {
      throw new ClawpatchError("pi CLI not available", 4, "provider-auth");
    }
    // pi writes --version to stderr; fall back to it when stdout is empty.
    const version = result.stdout.trim();
    return version.length > 0 ? version : result.stderr.trim();
  },
  async review(root: string, prompt: string, model: string | null): Promise<ReviewOutput> {
    const output = await runPiJson(root, prompt, model, reviewJsonSchema, "read-only");
    return reviewOutputSchema.parse(output);
  },
  async fix(root: string, prompt: string, model: string | null): Promise<FixPlanOutput> {
    const output = await runPiJson(root, prompt, model, fixPlanJsonSchema, "workspace-write");
    return fixPlanOutputSchema.parse(output);
  },
  async revalidate(root: string, prompt: string, model: string | null): Promise<RevalidateOutput> {
    const output = await runPiJson(root, prompt, model, revalidateJsonSchema, "read-only");
    return revalidateOutputSchema.parse(output);
  },
};

const mockProvider: Provider = {
  name: "mock",
  async check(): Promise<string> {
    return "mock";
  },
  async review(_root: string, prompt: string): Promise<ReviewOutput> {
    if (!prompt.includes("TODO_BUG") && !prompt.includes("BUG:")) {
      return { findings: [], inspected: { files: [], symbols: [], notes: ["mock clean"] } };
    }
    return {
      findings: [
        {
          title: "Marker bug found",
          category: "bug",
          severity: "medium",
          confidence: "high",
          evidence: [
            {
              path: "src/index.ts",
              startLine: null,
              endLine: null,
              symbol: null,
              quote: "TODO_BUG",
            },
          ],
          reasoning: "Mock provider found an explicit bug marker.",
          reproduction: null,
          recommendation: "Replace marker with real handling.",
          whyTestsDoNotAlreadyCoverThis:
            "Mock fixtures do not encode this marker as intended behavior.",
          suggestedRegressionTest: "Add a focused test that fails when TODO_BUG is present.",
          minimumFixScope: "Replace the marker in the owning feature file.",
        },
      ],
      inspected: { files: ["src/index.ts"], symbols: [], notes: ["mock finding"] },
    };
  },
  async fix(): Promise<FixPlanOutput> {
    return {
      summary: "mock fix plan",
      findingIds: [],
      plannedFiles: [],
      risk: "low",
      steps: ["mock"],
      validationCommands: ["touch SHOULD_NOT_RUN_PROVIDER_COMMANDS"],
    };
  },
  async revalidate(_root: string, prompt: string): Promise<RevalidateOutput> {
    if (prompt.includes("REVALIDATE_FIXED")) {
      return { outcome: "fixed", reasoning: "mock fixed outcome", commands: ["mock fixed"] };
    }
    if (prompt.includes("REVALIDATE_OPEN")) {
      return { outcome: "open", reasoning: "mock open outcome", commands: ["mock open"] };
    }
    if (prompt.includes("REVALIDATE_FALSE_POSITIVE")) {
      return {
        outcome: "false-positive",
        reasoning: "mock false-positive outcome",
        commands: ["mock false-positive"],
      };
    }
    return { outcome: "uncertain", reasoning: "mock provider cannot inspect fixes", commands: [] };
  },
};

const mockFailProvider: Provider = {
  name: "mock-fail",
  async check(): Promise<string> {
    return "mock-fail";
  },
  async review(): Promise<ReviewOutput> {
    throw new ClawpatchError("mock review failure", 1, "mock-failure");
  },
  async fix(): Promise<FixPlanOutput> {
    throw new ClawpatchError("mock fix failure", 1, "mock-failure");
  },
  async revalidate(): Promise<RevalidateOutput> {
    throw new ClawpatchError("mock revalidate failure", 1, "mock-failure");
  },
};

async function runCodexJson(
  root: string,
  prompt: string,
  model: string | null,
  schema: object,
  sandbox = "read-only",
): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "clawpatch-codex-"));
  const schemaPath = join(dir, "schema.json");
  const outputPath = join(dir, "output.json");
  await writeFile(schemaPath, JSON.stringify(schema), "utf8");
  const args = [
    "exec",
    "--cd",
    root,
    "--sandbox",
    sandbox,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
  ];
  if (model !== null) {
    args.push("--model", model);
  }
  args.push("-");
  const result = await runCommandArgs("codex", args, root, prompt);
  if (result.exitCode !== 0) {
    throw new ClawpatchError(
      `codex provider failed: ${result.stderr || result.stdout}`,
      providerExitCode(result.stderr),
      "provider-failure",
    );
  }
  const raw = await readFile(outputPath, "utf8").catch(() => "");
  if (raw.trim().length === 0) {
    throw new ClawpatchError("codex provider produced no JSON output", 8, "malformed-output");
  }
  return JSON.parse(raw) as unknown;
}

type Sandbox = "read-only" | "workspace-write";

/**
 * Build the argv for `claude -p` with structured output.
 *
 * Exported for testing: provider command construction is the kind of thing that
 * silently rots when claude-code changes flags, so it gets a focused test.
 */
export function buildClaudeArgs(
  root: string,
  schema: object,
  model: string | null,
  sandbox: Sandbox,
): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(schema),
    "--add-dir",
    root,
  ];
  if (model !== null) {
    args.push("--model", model);
  }
  if (sandbox === "read-only") {
    args.push("--allowedTools", "Read Glob Grep");
  } else {
    args.push("--dangerously-skip-permissions");
  }
  return args;
}

/**
 * Parse the envelope returned by `claude -p --output-format json`.
 *
 * Shape: { type: "result", is_error: bool, result: string, ... }.
 * With `--json-schema` the `result` field is a JSON-encoded string conforming
 * to the schema. We parse the envelope, surface errors, and JSON.parse the
 * inner payload.
 */
export function parseClaudeEnvelope(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new ClawpatchError("claude provider produced no output", 8, "malformed-output");
  }
  let envelope: { is_error?: boolean; result?: unknown; error?: string };
  try {
    envelope = JSON.parse(trimmed) as typeof envelope;
  } catch {
    throw new ClawpatchError(
      `claude provider returned non-JSON envelope: ${trimmed.slice(0, 200)}`,
      8,
      "malformed-output",
    );
  }
  if (envelope.is_error === true) {
    throw new ClawpatchError(
      `claude provider reported error: ${envelope.error ?? "unknown"}`,
      1,
      "provider-failure",
    );
  }
  const result = envelope.result;
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as unknown;
    } catch {
      throw new ClawpatchError(
        `claude provider result is not valid JSON: ${result.slice(0, 200)}`,
        8,
        "malformed-output",
      );
    }
  }
  if (result === null || result === undefined) {
    throw new ClawpatchError("claude provider envelope missing result", 8, "malformed-output");
  }
  return result;
}

async function runClaudeJson(
  root: string,
  prompt: string,
  model: string | null,
  schema: object,
  sandbox: Sandbox,
): Promise<unknown> {
  const args = buildClaudeArgs(root, schema, model, sandbox);
  const result = await runCommandArgs("claude", args, root, prompt, { trimOutput: false });
  if (result.exitCode !== 0) {
    throw new ClawpatchError(
      `claude provider failed: ${result.stderr || result.stdout}`,
      providerExitCode(result.stderr),
      "provider-failure",
    );
  }
  return parseClaudeEnvelope(result.stdout);
}

/**
 * Build the argv for `pi -p` with JSON output mode.
 *
 * Pi has no `--json-schema` equivalent, so we constrain tools and inline the
 * schema in the prompt instead (see `wrapPiPrompt`).
 */
export function buildPiArgs(model: string | null, sandbox: Sandbox): string[] {
  const args = ["-p", "--mode", "json", "--no-session"];
  if (model !== null) {
    args.push("--model", model);
  }
  if (sandbox === "read-only") {
    args.push("-t", "read,glob,grep");
  }
  return args;
}

/**
 * Wrap a prompt with a strict instruction to emit only JSON matching the
 * schema. Pi has no native schema enforcement; this prompt + Zod validation
 * downstream is the safety net.
 */
export function wrapPiPrompt(prompt: string, schema: object): string {
  return `${prompt}\n\n---\nRespond with ONLY a single JSON object matching this JSON Schema. No prose, no markdown fences, no commentary.\n\nSchema:\n${JSON.stringify(schema)}`;
}

/**
 * Extract the JSON payload from pi's `--mode json` output. Pi streams one
 * JSON event per line; the final assistant message is the payload we want.
 * If parsing the whole stdout as a single JSON object works, prefer that.
 */
export function parsePiEnvelope(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new ClawpatchError("pi provider produced no output", 8, "malformed-output");
  }
  const candidate = extractPiAssistantText(trimmed);
  const stripped = stripFences(candidate).trim();
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    throw new ClawpatchError(
      `pi provider returned non-JSON payload: ${stripped.slice(0, 200)}`,
      8,
      "malformed-output",
    );
  }
}

function extractPiAssistantText(stdout: string): string {
  // Try whole stdout first — pi may emit one envelope total.
  const single = tryParseJson(stdout);
  if (single !== undefined) {
    return assistantTextFromObject(single) ?? stdout;
  }
  // Otherwise scan lines bottom-up for the last assistant text.
  const lines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = tryParseJson(lines[index]!);
    if (parsed === undefined) {
      continue;
    }
    const text = assistantTextFromObject(parsed);
    if (text !== null && text !== undefined && text.length > 0) {
      return text;
    }
  }
  return stdout;
}

function assistantTextFromObject(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["text"] === "string") {
    return record["text"] as string;
  }
  if (typeof record["content"] === "string") {
    return record["content"] as string;
  }
  if (typeof record["result"] === "string") {
    return record["result"] as string;
  }
  if (typeof record["message"] === "string") {
    return record["message"] as string;
  }
  if (typeof record["message"] === "object" && record["message"] !== null) {
    const message = record["message"] as Record<string, unknown>;
    if (message["role"] === "assistant") {
      return assistantTextFromObject(message);
    }
  }
  if (Array.isArray(record["content"])) {
    const parts = record["content"] as unknown[];
    const joined = parts
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part !== null) {
          const partRecord = part as Record<string, unknown>;
          if (typeof partRecord["text"] === "string") {
            return partRecord["text"] as string;
          }
        }
        return "";
      })
      .filter((piece) => piece.length > 0)
      .join("");
    if (joined.length > 0) {
      return joined;
    }
  }
  return null;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function stripFences(value: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(value.trim());
  if (fence !== null && fence[1] !== undefined) {
    return fence[1];
  }
  return value;
}

async function runPiJson(
  root: string,
  prompt: string,
  model: string | null,
  schema: object,
  sandbox: Sandbox,
): Promise<unknown> {
  const args = buildPiArgs(model, sandbox);
  const wrapped = wrapPiPrompt(prompt, schema);
  const result = await runCommandArgs("pi", args, root, wrapped, { trimOutput: false });
  if (result.exitCode !== 0) {
    throw new ClawpatchError(
      `pi provider failed: ${result.stderr || result.stdout}`,
      providerExitCode(result.stderr),
      "provider-failure",
    );
  }
  return parsePiEnvelope(result.stdout);
}

function providerExitCode(stderr: string): number {
  if (/auth|login|api key/iu.test(stderr)) {
    return 4;
  }
  if (/quota|rate.?limit/iu.test(stderr)) {
    return 5;
  }
  return 1;
}

const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["findings", "inspected"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "category",
          "severity",
          "confidence",
          "evidence",
          "reasoning",
          "reproduction",
          "recommendation",
          "whyTestsDoNotAlreadyCoverThis",
          "suggestedRegressionTest",
          "minimumFixScope",
        ],
        properties: {
          title: { type: "string" },
          category: {
            enum: [
              "bug",
              "security",
              "performance",
              "concurrency",
              "api-contract",
              "data-loss",
              "test-gap",
              "docs-gap",
              "build-release",
              "maintainability",
            ],
          },
          severity: { enum: ["critical", "high", "medium", "low"] },
          confidence: { enum: ["high", "medium", "low"] },
          evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
          reasoning: { type: "string" },
          reproduction: { anyOf: [{ type: "string" }, { type: "null" }] },
          recommendation: { type: "string" },
          whyTestsDoNotAlreadyCoverThis: { type: "string" },
          suggestedRegressionTest: { anyOf: [{ type: "string" }, { type: "null" }] },
          minimumFixScope: { type: "string" },
        },
      },
    },
    inspected: {
      type: "object",
      additionalProperties: false,
      required: ["files", "symbols", "notes"],
      properties: {
        files: { type: "array", items: { type: "string" } },
        symbols: { type: "array", items: { type: "string" } },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  },
  $defs: {
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["path", "startLine", "endLine", "symbol", "quote"],
      properties: {
        path: { type: "string" },
        startLine: { anyOf: [{ type: "integer" }, { type: "null" }] },
        endLine: { anyOf: [{ type: "integer" }, { type: "null" }] },
        symbol: { anyOf: [{ type: "string" }, { type: "null" }] },
        quote: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    },
  },
};

const revalidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "reasoning", "commands"],
  properties: {
    outcome: { enum: ["fixed", "open", "false-positive", "uncertain"] },
    reasoning: { type: "string" },
    commands: { type: "array", items: { type: "string" } },
  },
};

const fixPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findingIds", "plannedFiles", "risk", "steps", "validationCommands"],
  properties: {
    summary: { type: "string" },
    findingIds: { type: "array", items: { type: "string" } },
    plannedFiles: { type: "array", items: { type: "string" } },
    risk: { enum: ["low", "medium", "high"] },
    steps: { type: "array", items: { type: "string" } },
    validationCommands: { type: "array", items: { type: "string" } },
  },
};
