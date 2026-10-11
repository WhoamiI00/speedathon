// Roles people pick at check-in, and the six sectors of the room circle they fall into.

export const ROLE_OPTIONS = ["Founder", "Investor", "Engineer", "Designer", "Researcher", "Student", "Mentor", "Corporate BD"] as const;

export const SECTORS = ["Founders", "Investors", "Builders", "Researchers", "Students", "Mentors & BD"] as const;

/** Sector index (0-5) for a free-text role. Unknown roles land in "Mentors & BD". */
export function sectorOf(role: string | null | undefined): number {
  const r = (role ?? "").toLowerCase();
  if (r.startsWith("found")) return 0;
  if (r.startsWith("invest") || r.includes("vc") || r.includes("angel")) return 1;
  if (r.startsWith("engin") || r.startsWith("design") || r.includes("developer")) return 2;
  if (r.startsWith("research") || r.includes("scien")) return 3;
  if (r.startsWith("student")) return 4;
  return 5;
}

/** "A founder", "An investor", ... for people who did not opt in to showing their name. */
export function anonymousLabel(role: string | null | undefined): string {
  const r = (role ?? "participant").trim().toLowerCase() || "participant";
  return /^[aeiou]/.test(r) ? `An ${r}` : `A ${r}`;
}

/** Public display name: the real name only with show_name opt-in (PLAN §2c). */
export function displayName(p: { name: string; role: string | null; show_name: boolean }): string {
  return p.show_name ? p.name : anonymousLabel(p.role);
}

export function initialsOf(p: { name: string; show_name: boolean; role: string | null }): string | null {
  if (!p.show_name) return null;
  const parts = p.name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || null;
}
