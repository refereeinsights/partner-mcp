export const ROLL_FORWARD_RESEARCH_STATUSES = [
  "unresearched",
  "pending",
  "no_dates_announced",
  "discontinued",
  "done",
  "ambiguous",
  "ready_to_create",
  "linked_existing",
] as const;

export type RollForwardResearchStatus = typeof ROLL_FORWARD_RESEARCH_STATUSES[number];

// Allowed forward transitions for each research status.
// done and discontinued are terminal for the target-year cycle.
const TRANSITION_GRAPH: Record<RollForwardResearchStatus, RollForwardResearchStatus[]> = {
  unresearched:       ["unresearched", "pending", "no_dates_announced", "discontinued", "done", "ambiguous", "ready_to_create", "linked_existing"],
  pending:            ["pending", "no_dates_announced", "discontinued", "done", "ambiguous", "ready_to_create", "linked_existing"],
  no_dates_announced: ["pending", "no_dates_announced", "ambiguous", "ready_to_create", "linked_existing", "discontinued"],
  ambiguous:          ["pending", "ambiguous", "no_dates_announced", "ready_to_create", "linked_existing", "discontinued"],
  ready_to_create:    ["ready_to_create", "ambiguous", "linked_existing", "done"],
  linked_existing:    ["linked_existing", "done"],
  discontinued:       ["discontinued"],
  done:               ["done"],
};

export function validateStatusTransition(from: RollForwardResearchStatus, to: RollForwardResearchStatus): void {
  const allowed = TRANSITION_GRAPH[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid roll-forward status transition: ${from} → ${to}`);
  }
}

export const SIBLING_MATCH_STATES = [
  "explicitly_linked",
  "deterministic_match",
  "likely_match_returned",
  "no_match_returned",
] as const;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeOrganizerDomain(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normalizeFamilyName(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/(^|[^0-9])(?:19|20)\d{2}([^0-9]|$)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function terminalSlugYear(slug?: string | null): number | null {
  const match = slug?.match(/-(\d{4})$/);
  return match ? Number(match[1]) : null;
}

export function sourceYearForTournament(input: {
  start_date?: string | null;
  slug?: string | null;
}): { year: number | null; warnings: string[] } {
  const dateYear = input.start_date && isIsoDate(input.start_date)
    ? Number(input.start_date.slice(0, 4))
    : null;
  const slugYear = terminalSlugYear(input.slug);
  const warnings =
    dateYear !== null && slugYear !== null && dateYear !== slugYear
      ? ["source_start_date_year_conflicts_with_slug_year"]
      : [];
  return { year: dateYear ?? slugYear, warnings };
}

export function siblingStatusMatches(
  filter: "no_confirmed_match" | "confirmed_match" | "any",
  state: typeof SIBLING_MATCH_STATES[number]
): boolean {
  if (filter === "any") return true;
  const confirmed = state === "explicitly_linked" || state === "deterministic_match";
  return filter === "confirmed_match" ? confirmed : !confirmed;
}
