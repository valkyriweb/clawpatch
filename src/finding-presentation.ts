import type { FeatureRecord, FindingRecord } from "./types.js";

export type FindingSummary = {
  id: string;
  title: string;
  severity: FindingRecord["severity"];
  category: FindingRecord["category"];
  confidence: FindingRecord["confidence"];
  triage: FindingRecord["triage"];
  status: FindingRecord["status"];
  feature: { id: string; title: string | null };
  evidence: Array<{
    path: string;
    startLine: number | null;
    endLine: number | null;
    symbol: string | null;
  }>;
  recommendation: string;
  reproduction: string | null;
  whyTestsDoNotAlreadyCoverThis: string;
  suggestedRegressionTest: string | null;
  minimumFixScope: string;
  next: string;
};

export function findingSummaries(
  findings: FindingRecord[],
  features: FeatureRecord[],
): FindingSummary[] {
  const featureById = new Map(features.map((feature) => [feature.featureId, feature]));
  return findings.map((finding) =>
    findingSummary(finding, featureById.get(finding.featureId) ?? null),
  );
}

export function findingSummary(
  finding: FindingRecord,
  feature: FeatureRecord | null,
): FindingSummary {
  return {
    id: finding.findingId,
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
    confidence: finding.confidence,
    triage: finding.triage,
    status: finding.status,
    feature: {
      id: finding.featureId,
      title: feature?.title ?? null,
    },
    evidence: finding.evidence.map((evidence) => ({
      path: evidence.path,
      startLine: evidence.startLine,
      endLine: evidence.endLine,
      symbol: evidence.symbol,
    })),
    recommendation: finding.recommendation,
    reproduction: finding.reproduction,
    whyTestsDoNotAlreadyCoverThis: finding.whyTestsDoNotAlreadyCoverThis,
    suggestedRegressionTest: finding.suggestedRegressionTest,
    minimumFixScope: finding.minimumFixScope,
    next: `clawpatch show --finding ${finding.findingId}`,
  };
}

export function evidenceLabel(evidence: FindingRecord["evidence"][number]): string {
  const line =
    evidence.startLine === null
      ? ""
      : evidence.endLine !== null && evidence.endLine !== evidence.startLine
        ? `:${evidence.startLine}-${evidence.endLine}`
        : `:${evidence.startLine}`;
  const symbol = evidence.symbol === null ? "" : ` (${evidence.symbol})`;
  return `${evidence.path}${line}${symbol}`;
}

export function featureLabel(featureId: string, feature: FeatureRecord | undefined): string {
  return feature === undefined ? featureId : `${feature.title} (${featureId})`;
}
