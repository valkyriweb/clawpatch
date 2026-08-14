import type { FeatureSeed } from "./mappers/types.js";
import type { FeatureRecord } from "./types.js";

export function seedIdentityParts(seed: FeatureSeed, symbol = seed.symbol): string[] {
  return [
    seed.kind,
    seed.source,
    seed.entryPath,
    seed.identityKey ?? seed.command ?? seed.route ?? symbol ?? "",
  ];
}

export function dedupeFeatureSeeds(seeds: FeatureSeed[]): FeatureSeed[] {
  const seen = new Set<string>();
  const output: FeatureSeed[] = [];
  for (const seed of seeds) {
    const key = JSON.stringify(seedIdentityParts(seed));
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(seed);
  }
  return output;
}

export function stableFeatureJson(feature: FeatureRecord): string {
  const {
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    lock: _lock,
    analysisHistory: _analysisHistory,
    ...stable
  } = feature;
  return JSON.stringify(stable);
}
