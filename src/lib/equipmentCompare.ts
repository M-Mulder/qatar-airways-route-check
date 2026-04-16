/** Narrow bucket for “same aircraft family” between planned label and FR24 cell text. */
export function equipmentCategory(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const u = text.toUpperCase().replace(/\s+/g, " ");
  if (/\bA351\b|A35K|350-1000/i.test(u)) return "A350-1000";
  if (/\bA359\b|\b359\b|350-900|350-941/i.test(u)) return "A350-900";
  if (/\bB77W\b|\b77W\b|777-300|\bB773\b/i.test(u)) return "B77W";
  return null;
}

/** Human summary of FR24 aircraft cell (canonical family when recognized). */
export function fr24EquipmentSummary(cell: string | null | undefined): string | null {
  if (!cell?.trim()) return null;
  const cat = equipmentCategory(cell);
  if (cat) return cat;
  const t = cell.replace(/\s+/g, " ").trim();
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/**
 * Whether planned equipment label and FR24 cell describe the same family.
 * `null` = inconclusive (missing text or unrecognized mapping).
 */
export function matchPlannedVsFr24Equipment(plannedLabel: string | null, fr24Cell: string | null): boolean | null {
  const p = plannedLabel?.trim();
  const c = fr24Cell?.trim();
  if (!p || !c) return null;
  const pc = equipmentCategory(p);
  const cc = equipmentCategory(c);
  if (pc && cc) return pc === cc;
  const loose =
    c.toUpperCase().includes(p.toUpperCase()) || p.toUpperCase().includes(c.toUpperCase().slice(0, 6));
  if (loose) return true;
  return null;
}
