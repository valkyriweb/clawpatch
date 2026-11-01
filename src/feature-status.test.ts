import { describe, expect, it } from "vitest";
import { featureStatusForFindings } from "./feature-status.js";
import type { FeatureRecord, FindingRecord } from "./types.js";

describe("feature status reduction", () => {
  it("marks resolved feature findings fixed", () => {
    expect(featureStatusForFindings(feature("needs-fix"), [finding("fixed")])).toBe("fixed");
    expect(featureStatusForFindings(feature("needs-fix"), [finding("false-positive")])).toBe(
      "fixed",
    );
  });

  it("reopens reviewed features with unresolved findings", () => {
    expect(featureStatusForFindings(feature("reviewed"), [finding("open")])).toBe("needs-fix");
    expect(featureStatusForFindings(feature("fixed"), [finding("uncertain")])).toBe("needs-fix");
  });

  it("preserves statuses when no transition applies", () => {
    expect(featureStatusForFindings(feature("pending"), [])).toBe("pending");
    expect(featureStatusForFindings(feature("needs-fix"), [finding("open")])).toBe("needs-fix");
  });
});

function feature(status: FeatureRecord["status"]): FeatureRecord {
  return {
    schemaVersion: 1,
    featureId: "feat_test",
    title: "Test",
    summary: "Test",
    kind: "library",
    source: "test",
    confidence: "high",
    entrypoints: [],
    ownedFiles: [],
    contextFiles: [],
    tests: [],
    tags: [],
    trustBoundaries: [],
    status,
    lock: null,
    findingIds: [],
    patchAttemptIds: [],
    analysisHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function finding(status: FindingRecord["status"]): FindingRecord {
  return {
    schemaVersion: 1,
    findingId: `fnd_${status}`,
    featureId: "feat_test",
    title: "Finding",
    category: "bug",
    severity: "high",
    confidence: "high",
    triage: "risk",
    evidence: [],
    reasoning: "Reasoning",
    reproduction: null,
    recommendation: "Fix",
    whyTestsDoNotAlreadyCoverThis: "Gap",
    suggestedRegressionTest: null,
    minimumFixScope: "One function",
    status,
    history: [],
    signature: "signature",
    linkedPatchAttemptIds: [],
    createdByRunId: "run_test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
