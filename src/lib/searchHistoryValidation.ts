import { createHash } from "node:crypto";
import { normalizeSport as normalizeCanonicalSport } from "./normalize";

// The rest of this codebase has no canonical state/jurisdiction whitelist —
// `normalizeState()` in normalize.ts only checks length === 2. Search-history
// scopes need real validation (reject "TBD"/"NA"/"VARIOUS"/"ZZ" placeholders),
// so this list is introduced here as new, documented state for this feature.
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
  "UT", "VT", "VA", "WA", "WV", "WI", "WY"
] as const;

export const US_STATE_CODE_SET = new Set<string>(US_STATE_CODES);

export class SearchHistoryValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "SearchHistoryValidationError";
    this.issues = issues;
  }
}

export function normalizeAndValidateState(input: string): string {
  const value = input.trim().toUpperCase();
  if (!US_STATE_CODE_SET.has(value)) {
    throw new SearchHistoryValidationError([`invalid state: "${input}" (expected a supported 2-letter US state or DC code)`]);
  }
  return value;
}

export function normalizeAndValidateSport(input: string): string {
  const normalized = normalizeCanonicalSport(input);
  if (!normalized) {
    throw new SearchHistoryValidationError([`invalid sport: "${input}" (not a canonical project sport)`]);
  }
  return normalized;
}

export function validateHttpUrl(input: string, fieldName: string): string {
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SearchHistoryValidationError([`invalid ${fieldName}: "${input}" is not a parseable URL`]);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SearchHistoryValidationError([`invalid ${fieldName}: "${input}" must use http or https (got "${parsed.protocol}")`]);
  }
  return trimmed;
}

export function normalizeOrganizerDomain(input: string): string {
  const trimmed = input.trim();
  let hostname: string;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      hostname = new URL(trimmed).hostname.toLowerCase();
    } else if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) {
      hostname = new URL(`https://${trimmed}`).hostname.toLowerCase();
    } else {
      hostname = trimmed.toLowerCase();
    }
  } catch {
    throw new SearchHistoryValidationError([`invalid organizer domain: "${input}"`]);
  }

  hostname = hostname.replace(/^www\./, "");

  const validHostnamePattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
  if (!hostname || hostname.includes(" ") || !validHostnamePattern.test(hostname)) {
    throw new SearchHistoryValidationError([`invalid organizer domain: "${input}"`]);
  }
  return hostname;
}

/**
 * Validates every element; if any is invalid, rejects the whole array and
 * reports every invalid element (per prompt: "reject the entire tool input
 * if any element is invalid" / "report every invalid element").
 */
export function normalizeOrganizerDomainsArray(domains: string[] | undefined): string[] {
  if (!domains || domains.length === 0) return [];
  const issues: string[] = [];
  const normalized: string[] = [];
  for (const domain of domains) {
    try {
      normalized.push(normalizeOrganizerDomain(domain));
    } catch (err) {
      if (err instanceof SearchHistoryValidationError) issues.push(...err.issues);
      else throw err;
    }
  }
  if (issues.length > 0) {
    throw new SearchHistoryValidationError(issues);
  }
  return Array.from(new Set(normalized));
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateIsoDate(input: string, fieldName: string): string {
  if (!ISO_DATE_PATTERN.test(input)) {
    throw new SearchHistoryValidationError([`invalid ${fieldName}: "${input}" must be strict ISO YYYY-MM-DD`]);
  }
  const [y, m, d] = input.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new SearchHistoryValidationError([`invalid ${fieldName}: "${input}" is not a real calendar date`]);
  }
  return input;
}

export function assertDateOrder(from: string | undefined | null, to: string | undefined | null, label: string): void {
  if (from && to && from > to) {
    throw new SearchHistoryValidationError([`${label}: start ("${from}") must not be after end ("${to}")`]);
  }
}

const MAX_PROMPT_BYTES = 64 * 1024;

/**
 * Truncates on a UTF-8 byte boundary without splitting a multi-byte
 * character. The stable hash is always computed from the full,
 * untruncated input by the caller before calling this.
 */
export function truncatePromptForStorage(text: string): { stored: string; truncated: boolean } {
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= MAX_PROMPT_BYTES) {
    return { stored: text, truncated: false };
  }
  let end = MAX_PROMPT_BYTES;
  // Back off until we land on a valid UTF-8 character boundary.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return { stored: buf.subarray(0, end).toString("utf8"), truncated: true };
}

export function hashPrompt(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
