import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { ClawpatchError } from "./errors.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT") || isNodeError(error, "ENOTDIR")) {
      return false;
    }
    throw error;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ClawpatchError(`invalid JSON in ${path}: ${message}`, 2, "invalid-state");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ClawpatchError(
      `invalid data in ${path}: ${z.prettifyError(result.error)}`,
      2,
      "invalid-state",
    );
  }
  return result.data;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  let renamed = false;
  try {
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tmp, path);
    renamed = true;
  } finally {
    if (!renamed) {
      await unlink(tmp).catch(() => {});
    }
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
