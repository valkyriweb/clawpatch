import { suppressedTestCommandTag } from "./mappers/types.js";
import { FeatureRecord } from "./types.js";

export type ValidationCommandConfig = {
  typecheck: string | null;
  lint: string | null;
  format: string | null;
  test: string | null;
};

export function validationCommandsForFeature(
  feature: FeatureRecord | null,
  commands: ValidationCommandConfig,
): string[] {
  const featureCommands = (feature?.tests ?? []).flatMap((test) =>
    test.command === null || test.command.length === 0 ? [] : [test.command],
  );
  const configuredTest =
    feature?.tags.includes(suppressedTestCommandTag) === true ? null : commands.test;
  const ordered = [
    commands.format,
    ...featureCommands,
    commands.typecheck,
    commands.lint,
    configuredTest,
  ].filter((command): command is string => command !== null && command.length > 0);
  return Array.from(new Set(ordered));
}
