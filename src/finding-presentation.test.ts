import { describe, expect, it } from "vitest";
import { evidenceLabel, featureLabel, findingSummaries } from "./finding-presentation.js";
import type { FeatureRecord, FindingRecord } from "./types.js";

describe("finding presentation", () => {
  it("projects findings with feature context and stable next action", () => {
    const finding = findingRecord();
    const summaries = findingSummaries([finding], [featureRecord()]);

    expect(summaries).toEqual([
      expect.objectContaining({
        id: "fnd_test",
        feature: { id: "feat_test", title: "Test feature" },
        evidence: [{ path: "src/index.ts", startLine: 4, endLine: 6, symbol: "run" }],
        next: "clawpatch show --finding fnd_test",
      }),
    ]);
  });

  it("formats evidence ranges, symbols, and missing features", () => {
    expect(evidenceLabel(findingRecord().evidence[0]!)).toBe("src/index.ts:4-6 (run)");
    expect(featureLabel("feat_missing", undefined)).toBe("feat_missing");
    expect(featureLabel("feat_test", featureRecord())).toBe("Test feature (feat_test)");
  });
});

function featureRecord(): FeatureRecord {
  return {
    schemaVersion: 1,
    featureId: "feat_test",
    title: "Test feature",
    summary: "Summary",
    kind: "library",
    source: "test",
    confidence: "high",
    entrypoints: [],
    ownedFiles: [],
    contextFiles: [],
    tests: [],
    tags: [],
    trustBoundaries: [],
    status: "needs-fix",
    lock: null,
    findingIds: ["fnd_test"],
    patchAttemptIds: [],
    analysisHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function findingRecord(): FindingRecord {
  return {
    schemaVersion: 1,
    findingId: "fnd_test",
    featureId: "feat_test",
    title: "Test finding",
    category: "bug",
    severity: "high",
    confidence: "high",
    triage: "risk",
    evidence: [
      {
        path: "src/index.ts",
        startLine: 4,
        endLine: 6,
        symbol: "run",
        quote: "broken",
      },
    ],
    reasoning: "Reasoning",
    reproduction: "Reproduction",
    recommendation: "Recommendation",
    whyTestsDoNotAlreadyCoverThis: "Missing case",
    suggestedRegressionTest: "Add the case",
    minimumFixScope: "One function",
    status: "open",
    history: [],
    signature: "signature",
    linkedPatchAttemptIds: [],
    createdByRunId: "run_test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
