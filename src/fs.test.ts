import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJson, writeJson } from "./fs.js";
import { fixtureRoot } from "./test-helpers.js";
import { z } from "zod";

describe("writeJson", () => {
  it("atomically replaces a JSON file", async () => {
    const root = await fixtureRoot("clawpatch-write-json-");
    const path = join(root, "nested", "record.json");

    await writeJson(path, { value: 1 });
    await writeJson(path, { value: 2 });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ value: 2 });
    expect(await readdir(join(root, "nested"))).toEqual(["record.json"]);
  });

  it("removes its temporary file when replacement fails", async () => {
    const root = await fixtureRoot("clawpatch-write-json-failure-");

    await expect(writeJson(root, { value: 1 })).rejects.toThrow();

    const parent = dirname(root);
    const prefix = `${basename(root)}.tmp-`;
    expect((await readdir(parent)).filter((name) => name.startsWith(prefix))).toEqual([]);
  });
});

describe("readJson", () => {
  it("reports malformed JSON with path context and a stable code", async () => {
    const root = await fixtureRoot("clawpatch-read-json-");
    const path = join(root, "broken.json");
    await writeFile(path, "{broken", "utf8");

    await expect(readJson(path, z.object({ value: z.number() }))).rejects.toMatchObject({
      code: "invalid-state",
      message: expect.stringContaining(path),
    });
  });

  it("reports schema failures with path context", async () => {
    const root = await fixtureRoot("clawpatch-read-data-");
    const path = join(root, "wrong.json");
    await writeFile(path, '{"value":"wrong"}', "utf8");

    await expect(readJson(path, z.object({ value: z.number() }))).rejects.toMatchObject({
      code: "invalid-state",
      message: expect.stringContaining(path),
    });
  });
});
