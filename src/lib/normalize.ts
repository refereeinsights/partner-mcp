const SUPPORTED_SPORTS = [
  "soccer",
  "baseball",
  "softball",
  "lacrosse",
  "basketball",
  "hockey",
  "volleyball",
  "futsal"
] as const;

export type SupportedSport = typeof SUPPORTED_SPORTS[number];

export const supportedSportsSet = new Set<SupportedSport>(SUPPORTED_SPORTS);

export function normalizeSport(input?: string | null): SupportedSport | undefined {
  if (!input) return undefined;
  const value = input.toLowerCase().trim();
  return supportedSportsSet.has(value as SupportedSport)
    ? (value as SupportedSport)
    : undefined;
}

export function normalizeState(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return undefined;
}

export function compact<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value;
}
