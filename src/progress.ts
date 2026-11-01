export type ProgressContext = {
  options: {
    quiet: boolean;
  };
};

export type ProgressFields = Record<string, string | number | boolean>;

export function emitProgress(
  context: ProgressContext,
  command: string,
  event: string,
  fields: ProgressFields,
): void {
  if (context.options.quiet) {
    return;
  }
  const values = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  process.stderr.write(`clawpatch ${command} ${event}${values.length > 0 ? ` ${values}` : ""}\n`);
}
