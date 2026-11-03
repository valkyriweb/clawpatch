import { nowIso } from "./fs.js";
import { readFeatures, readFindings, writeFeature, type StatePaths } from "./state.js";
import type { FeatureRecord, FindingRecord } from "./types.js";

export async function refreshFeatureStatus(paths: StatePaths, featureId: string): Promise<void> {
  const [features, findings] = await Promise.all([readFeatures(paths), readFindings(paths)]);
  await refreshFeatureStatuses(paths, features, findings, new Set([featureId]));
}

export async function refreshFeatureStatuses(
  paths: StatePaths,
  features: FeatureRecord[],
  findings: FindingRecord[],
  featureIds: ReadonlySet<string>,
): Promise<void> {
  const findingsByFeature = new Map<string, FindingRecord[]>();
  for (const finding of findings) {
    if (!featureIds.has(finding.featureId)) {
      continue;
    }
    const grouped = findingsByFeature.get(finding.featureId) ?? [];
    grouped.push(finding);
    findingsByFeature.set(finding.featureId, grouped);
  }
  for (const feature of features) {
    if (!featureIds.has(feature.featureId)) {
      continue;
    }
    const status = featureStatusForFindings(
      feature,
      findingsByFeature.get(feature.featureId) ?? [],
    );
    if (status !== feature.status) {
      await writeFeature(paths, { ...feature, status, updatedAt: nowIso() });
    }
  }
}

export function featureStatusForFindings(
  feature: FeatureRecord,
  findings: FindingRecord[],
): FeatureRecord["status"] {
  const hasUnresolved = findings.some((finding) => ["open", "uncertain"].includes(finding.status));
  if (!hasUnresolved && findings.length > 0) {
    return "fixed";
  }
  if (hasUnresolved && ["fixed", "revalidated", "reviewed"].includes(feature.status)) {
    return "needs-fix";
  }
  return feature.status;
}
