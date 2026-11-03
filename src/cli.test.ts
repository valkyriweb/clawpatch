import { describe, expect, it } from "vitest";
import { helpText, parseArgs } from "./cli.js";

const commands = [
  "init",
  "map",
  "status",
  "review",
  "ci",
  "report",
  "show",
  "next",
  "triage",
  "fix",
  "open-pr",
  "revalidate",
  "doctor",
  "clean-locks",
] as const;

describe("CLI help", () => {
  it("lists every registered command in dispatch order", () => {
    const help = helpText();

    expect(help).toBe(`clawpatch: automated code review that lands fixes

Usage:
  clawpatch [global flags] <command> [flags]

Commands:
${commands.map((command) => `  ${command}`).join("\n")}

Global flags:
  --root <path>
  --state-dir <path>
  --config <path>
  --json
  --plain
  -q, --quiet
  -v, --verbose
  --debug
  --no-color
  --no-input
  -h, --help
  --version
`);
  });

  it.each(commands)("renders registered help for %s", (command) => {
    const help = helpText(command);

    expect(help).toMatch(new RegExp(`^clawpatch ${command}\\n\\nUsage:\\n`));
    expect(help).toContain("\nFlags:\n");
    expect(help).toContain("  --json\n");
    expect(help.endsWith("\n")).toBe(true);
    expect(parseArgs([command, "--help"])).toMatchObject({ command, help: true });
  });

  it("keeps command-specific option descriptions", () => {
    expect(helpText("review")).toContain("--mode <default|deslopify>");
    expect(helpText("review")).toContain("-q, --quiet");
    expect(helpText("ci")).toContain("see clawpatch review --help for details");
    expect(helpText("next")).toContain("--status <status>  default: open");
    expect(helpText("triage")).toContain("--status <open|false-positive|fixed|wont-fix|uncertain>");
    expect(helpText("revalidate")).toContain("clawpatch revalidate --since <ref> [flags]");
  });

  it("falls back to root help for unknown command help requests", () => {
    expect(helpText("revie")).toBe(helpText());
  });
});
