import { describe, expect, it } from "vitest";
import {
  dedupeFeatureSeeds,
  seedIdentityParts,
  stableFeatureJson,
} from "./mapper-reconciliation.js";
import type { FeatureSeed } from "./mappers/types.js";
import type { FeatureRecord } from "./types.js";

function seed(overrides: Partial<FeatureSeed> = {}): FeatureSeed {
  return {
    title: "feature",
    summary: "summary",
    kind: "library",
    source: "test",
    confidence: "high",
    entryPath: "src/index.ts",
    symbol: "entry",
    route: null,
    command: null,
    tags: [],
    trustBoundaries: [],
    ...overrides,
  };
}

function feature(overrides: Partial<FeatureRecord> = {}): FeatureRecord {
  return {
    schemaVersion: 1,
    featureId: "feat_1",
    title: "feature",
    summary: "summary",
    kind: "library",
    source: "test",
    confidence: "high",
    entrypoints: [{ path: "src/index.ts", symbol: null, route: null, command: null }],
    ownedFiles: [],
    contextFiles: [],
    tests: [],
    tags: [],
    trustBoundaries: [],
    status: "pending",
    lock: null,
    findingIds: [],
    patchAttemptIds: [],
    analysisHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapper reconciliation", () => {
  it("uses one ordered identity definition for IDs and deduplication", () => {
    expect(
      seedIdentityParts(seed({ identityKey: "identity", command: "command", route: "route" })),
    ).toEqual(["library", "test", "src/index.ts", "identity"]);
    expect(seedIdentityParts(seed({ symbol: "symbol" }), null)).toEqual([
      "library",
      "test",
      "src/index.ts",
      "",
    ]);
  });

  it("keeps the first seed for each identity", () => {
    const first = seed({ title: "first" });
    const duplicate = seed({ title: "duplicate" });
    const distinct = seed({ title: "distinct", identityKey: "other" });

    expect(dedupeFeatureSeeds([first, duplicate, distinct])).toEqual([first, distinct]);
  });

  it("ignores volatile feature fields", () => {
    const original = feature();
    const volatileChange = feature({
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      lock: {
        lockedByRunId: "run_1",
        lockedAt: "2026-03-01T00:00:00.000Z",
        hostname: "host",
        pid: 1,
      },
      analysisHistory: [
        {
          runId: "run_1",
          kind: "review",
          summary: "clean",
          provider: "mock",
          model: null,
          reasoningEffort: null,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    });

    expect(stableFeatureJson(volatileChange)).toBe(stableFeatureJson(original));
    expect(stableFeatureJson(feature({ status: "reviewed" }))).not.toBe(
      stableFeatureJson(original),
    );
  });
});
