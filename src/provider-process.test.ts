import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { providerByName } from "./provider.js";
import type { ProviderOptions } from "./provider-types.js";

// Restored from the fork and adapted to upstream's provider rewrite: options are
// now required, claude probes `--version` before every call, pi reads its prompt
// from an `@file` argument and prints plain JSON, and review() returns the
// partitioned shape with droppedFindings.
const options: ProviderOptions = { model: null, reasoningEffort: null, skipGitRepoCheck: false };

async function withProvider(
  name: string,
  response: { stdout: string; stderr?: string; exitCode?: number },
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "clawpatch-provider-"));
  const previousPath = process.env["PATH"];
  try {
    const bin = join(root, "bin");
    await mkdir(bin);
    await symlink(process.execPath, join(bin, "node"));
    await writeFile(join(root, "response.json"), JSON.stringify(response));
    await writeFile(
      join(bin, name),
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("9.9.9 (fixture)\\n");
  process.exit(0);
}
const promptFile = args.find((arg) => arg.startsWith("@"));
fs.writeFileSync(
  "request.txt",
  promptFile === undefined ? fs.readFileSync(0, "utf8") : fs.readFileSync(promptFile.slice(1), "utf8"),
);
const response = JSON.parse(fs.readFileSync("response.json", "utf8"));
process.stdout.write(response.stdout);
process.stderr.write(response.stderr || "");
process.exitCode = response.exitCode || 0;
`,
      { mode: 0o755 },
    );
    process.env["PATH"] = bin;
    await run(root);
  } finally {
    if (previousPath === undefined) delete process.env["PATH"];
    else process.env["PATH"] = previousPath;
    await rm(root, { recursive: true, force: true });
  }
}

function responseEnvelope(name: string, output: unknown): string {
  if (name === "claude") return JSON.stringify({ structured_output: output });
  return JSON.stringify(output);
}

describe.each(["claude", "pi"])("%s provider process boundary", (name) => {
  it.runIf(process.platform !== "win32")(
    "preserves large review output and prompt input",
    async () => {
      const output = {
        findings: [],
        inspected: { files: ["src/owner.ts"], symbols: [], notes: ["Unicode 🔧\n".repeat(1_000)] },
      };
      const prompt = 'Review "quotes", $variables and Unicode 🔧\nwithout a shell.';
      await withProvider(name, { stdout: responseEnvelope(name, output) }, async (root) => {
        expect(await providerByName(name).review(root, prompt, options)).toEqual({
          ...output,
          droppedFindings: [],
        });
        const input = await readFile(join(root, "request.txt"), "utf8");
        if (name === "claude") expect(input).toBe(prompt);
        else expect(input).toContain(`READ-ONLY REVIEW MODE.`);
        if (name === "pi") expect(input).toContain(`${prompt}\n\nProvider output schema:`);
      });
    },
  );

  it.runIf(process.platform !== "win32")("rejects schema-invalid review output", async () => {
    const output = { findings: "not an array", inspected: { files: [], symbols: [], notes: [] } };
    await withProvider(name, { stdout: responseEnvelope(name, output) }, async (root) => {
      await expect(providerByName(name).review(root, "review", options)).rejects.toMatchObject({
        code: "malformed-output",
        message: expect.stringContaining("malformed at findings"),
      });
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects a failed process despite valid output",
    async () => {
      const output = { findings: [], inspected: { files: [], symbols: [], notes: [] } };
      await withProvider(
        name,
        { stdout: responseEnvelope(name, output), stderr: "fixture provider failure", exitCode: 7 },
        async (root) => {
          await expect(providerByName(name).review(root, "review", options)).rejects.toMatchObject({
            code: "provider-failure",
            exitCode: 1,
            // Upstream's claude provider reports a stdout-derived signal, not raw stderr.
            message:
              name === "claude"
                ? expect.stringContaining("claude provider failed")
                : expect.stringContaining("fixture provider failure"),
          });
        },
      );
    },
  );
});
