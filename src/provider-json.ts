import { ClawpatchError } from "./errors.js";

export function extractJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fenceMatch && fenceMatch[1]) {
    const candidate = fenceMatch[1].trim();
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const candidates: Array<{ start: number; end: number; parent: number | null }> = [];
  const stack: number[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (stack.length === 0) {
      if (ch === "{") {
        stack.push(i);
      } else if (ch === '"') {
        const closingQuote = findProseQuoteEnd(text, i);
        if (closingQuote !== -1) i = closingQuote;
      }
      continue;
    }
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      stack.push(i);
    } else if (ch === "}" && stack.length > 0) {
      const start = stack.pop();
      if (start !== undefined) {
        candidates.push({ start, end: i + 1, parent: stack.at(-1) ?? null });
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate.parent !== null) continue;
    try {
      return JSON.parse(text.slice(candidate.start, candidate.end));
    } catch {}
  }

  const unmatched = new Set(stack);
  let recovered: unknown | null = null;
  for (const candidate of candidates) {
    if (candidate.parent === null || !unmatched.has(candidate.parent)) continue;
    try {
      recovered = JSON.parse(text.slice(candidate.start, candidate.end));
    } catch {}
  }
  return recovered;
}

function findProseQuoteEnd(text: string, start: number): number {
  let escape = false;
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch !== '"') continue;
    const next = text[i + 1];
    if (next !== undefined && /[\p{L}\p{N}_]/u.test(next)) return -1;
    let previous = i - 1;
    while (previous > start && /\s/u.test(text[previous] ?? "")) previous -= 1;
    if (text[previous] === "{" && text.slice(start + 1, i).trim() !== "{") return -1;
    return i;
  }
  return -1;
}

export function parseCodexJson(raw: string): unknown {
  const parsed = extractJson(raw.trim());
  if (parsed !== null) {
    return parsed;
  }
  const preview = safeProviderPreview(raw);
  throw new ClawpatchError(
    `codex provider produced unparseable JSON output (preview: ${preview})`,
    8,
    "malformed-output",
  );
}

export function safeProviderPreview(value: string, maxLength = 200): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}
