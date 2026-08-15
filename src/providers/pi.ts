import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandArgs } from "../exec.js";
import { ClawpatchError } from "../errors.js";
import { providerExitCode } from "../provider-errors.js";
import { extractJson, safeProviderPreview } from "../provider-json.js";
import { parseOrThrow, parseReviewOutput } from "../provider-output.js";
import { providerCheckTimeoutMs, providerTimeoutMs } from "../provider-runtime.js";
import {
  agentMapJsonSchema,
  fixPlanJsonSchema,
  reviewJsonSchema,
  revalidateJsonSchema,
} from "../provider-schema.js";
import type { PartitionedReviewOutput, Provider, ProviderOptions } from "../provider-types.js";
import {
  AgentMapOutput,
  FixPlanOutput,
  RevalidateOutput,
  agentMapOutputSchema,
  fixPlanOutputSchema,
  revalidateOutputSchema,
  type ReasoningEffort,
} from "../types.js";

const PI_DEFAULT_TIMEOUT_MS = 180_000;

export const piProvider: Provider = {
  name: "pi",
  async check(root: string): Promise<string> {
    const result = await runCommandArgs("pi", ["--version"], root, undefined, {
      timeoutMs: providerCheckTimeoutMs(),
    });
    if (result.exitCode !== 0) {
      throw new ClawpatchError("pi CLI not available", 4, "provider-auth");
    }
    return result.stdout.trim() || result.stderr.trim();
  },
  async map(root: string, prompt: string, options: ProviderOptions): Promise<AgentMapOutput> {
    const output = await runPiJson(root, prompt, options, agentMapJsonSchema, true);
    return parseOrThrow(agentMapOutputSchema, output, "pi map");
  },
  async review(
    root: string,
    prompt: string,
    options: ProviderOptions,
  ): Promise<PartitionedReviewOutput> {
    const output = await runPiJson(root, prompt, options, reviewJsonSchema, true);
    return parseReviewOutput(output);
  },
  async fix(root: string, prompt: string, options: ProviderOptions): Promise<FixPlanOutput> {
    const output = await runPiJson(root, prompt, options, fixPlanJsonSchema, false);
    return parseOrThrow(fixPlanOutputSchema, output, "pi fix-plan");
  },
  async revalidate(
    root: string,
    prompt: string,
    options: ProviderOptions,
  ): Promise<RevalidateOutput> {
    const output = await runPiJson(root, prompt, options, revalidateJsonSchema, true);
    return parseOrThrow(revalidateOutputSchema, output, "pi revalidate");
  },
};

async function runPiJson(
  root: string,
  prompt: string,
  options: ProviderOptions,
  schema: object,
  readOnly: boolean,
): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "clawpatch-pi-"));
  const promptPath = join(dir, "prompt.txt");
  await writeFile(promptPath, piPrompt(prompt, schema, readOnly), "utf8");

  try {
    const args = [
      "-p",
      "--no-session",
      "--no-context-files",
      "--no-skills",
      "--no-extensions",
      "--no-prompt-templates",
      "--no-themes",
      ...piExtensionArgs(),
      `@${promptPath}`,
      "Follow the attached clawpatch prompt. Return only the requested JSON object.",
    ];
    if (options.model !== null) {
      args.push("--model", options.model);
    }
    if (options.reasoningEffort !== null) {
      args.push("--thinking", piThinkingLevel(options.reasoningEffort));
    }
    if (readOnly) {
      args.push("--tools", "read");
    }
    const result = await runCommandArgs("pi", args, root, undefined, {
      trimOutput: false,
      timeoutMs: piTimeoutMs(),
    });
    if (result.exitCode !== 0) {
      throw new ClawpatchError(
        piFailureMessage(result.stdout, result.stderr),
        providerExitCode(result.stdout, result.stderr),
        "provider-failure",
      );
    }
    const text = result.stdout.trim();
    if (text.length === 0) {
      throw new ClawpatchError("pi provider produced no output", 8, "malformed-output");
    }
    const parsed = extractJson(text);
    if (parsed === null) {
      throw new ClawpatchError(
        `pi provider produced unparsable JSON (output preview: ${safeProviderPreview(text)})`,
        8,
        "malformed-output",
      );
    }
    return parsed;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function piPrompt(prompt: string, schema: object, readOnly: boolean): string {
  const promptBody = readOnly
    ? "READ-ONLY REVIEW MODE.\n" +
      "Do not modify, create, or delete any files.\n" +
      "Do not run shell commands.\n\n" +
      prompt
    : prompt;
  return `${promptBody}\n\nProvider output schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn only one JSON object matching the schema.`;
}

function piFailureMessage(stdout: string, stderr: string): string {
  if (stderr.trim().length > 0) {
    return `pi provider failed: ${safeProviderPreview(stderr)}`;
  }
  const preview = safeProviderPreview(stdout);
  return preview.length === 0
    ? "pi provider failed"
    : `pi provider failed (output preview: ${preview})`;
}

function piThinkingLevel(reasoningEffort: ReasoningEffort): string {
  return reasoningEffort === "none" ? "off" : reasoningEffort;
}

function piTimeoutMs(): number {
  return providerTimeoutMs("CLAWPATCH_PI_TIMEOUT_MS", PI_DEFAULT_TIMEOUT_MS);
}

// --no-extensions disables discovery, but explicit -e paths still load. That
// distinction matters for providers that pi can only reach through an
// extension: a model may resolve from the catalogue (config, which survives
// isolation) while the code registering its provider does not, and the run
// fails on a detail the catalogue appears to have covered.
//
// Deliberately env-only. Discovery stays off, so a reviewed checkout cannot
// name its own extension the way it could through a repository config file.
export function piExtensionArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env["CLAWPATCH_PI_EXTENSIONS"];
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .flatMap((path) => ["-e", path]);
}

export const piTesting = { piThinkingLevel, piExtensionArgs };
