import { equipmentCategory } from "./equipmentCompare";

export type CompareExplainInput = {
  plannedEquipment: string | null;
  actualEquipment: string | null;
  plannedQsuiteApi: boolean | null;
  actualQsuiteFromTail: boolean | null;
  actualAircraftCell: string | null;
  matchQsuite: boolean | null;
  matchEquipment: boolean | null;
  actualRegistration: string | null;
};

/** Match badge: both dimensions when stored; legacy rows use Qsuite only. */
export function overallCompareMatch(r: CompareExplainInput): boolean | null {
  if (r.matchQsuite === null) return null;
  if (r.matchEquipment === null) return r.matchQsuite;
  return r.matchQsuite === true && r.matchEquipment === true ? true : false;
}

function yn(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "unknown";
  return v ? "Yes" : "No";
}

function equipmentVerdict(
  planned: string | null,
  cell: string | null,
): { line: string; aligned: boolean | null } {
  const p = (planned ?? "").trim();
  const c = (cell ?? "").trim();
  if (!p && !c)
    return { line: "Aircraft type: nothing on your schedule and nothing readable from live tracking.", aligned: null };
  if (!p) return { line: `Aircraft type: missing on your schedule; live page shows “${truncate(c, 48)}”.`, aligned: null };
  if (!c) return { line: `Aircraft type: your schedule says ${p}; live tracking did not show a usable aircraft line.`, aligned: null };

  const pc = equipmentCategory(p);
  const cc = equipmentCategory(c);
  if (pc && cc) {
    if (pc === cc) return { line: `Aircraft type: matches your schedule (${pc}).`, aligned: true };
    return {
      line: `Aircraft type: differs — schedule ${p} (${pc}) vs live “${truncate(c, 40)}” (${cc}).`,
      aligned: false,
    };
  }

  const loose = c.toUpperCase().includes(p.toUpperCase()) || p.toUpperCase().includes(c.toUpperCase().slice(0, 6));
  if (loose) return { line: `Aircraft type: likely matches (schedule ${p}; live “${truncate(c, 40)}”).`, aligned: true };
  return {
    line: `Aircraft type: unclear — schedule ${p} vs live “${truncate(c, 40)}”.`,
    aligned: null,
  };
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type CompareBriefingQsuite = {
  kind: "match" | "mismatch" | "inconclusive";
  headline: string;
  apiLabel: string;
  tailLabel: string;
  registration: string | null;
};

export type CompareBriefingEquipment = {
  aligned: boolean | null;
  body: string;
};

export type CompareBriefing = {
  /** Hero line (overall plan vs FR24 when both stored; else Qsuite headline). */
  primaryTitle: string;
  primaryTint: "mint" | "rose" | "amber" | "cyan" | "muted";
  qsuite: CompareBriefingQsuite;
  equipment: CompareBriefingEquipment;
  footnote: string;
};

/** Structured copy for the Compare briefing popover (and optional plain summary). */
export function buildCompareBriefing(r: CompareExplainInput): CompareBriefing {
  const api = r.plannedQsuiteApi;
  const tail = r.actualQsuiteFromTail;
  const reg = (r.actualRegistration ?? "").trim() || null;
  const legacy = r.matchEquipment === null;
  const overall = overallCompareMatch(r);

  const qsuite: CompareBriefingQsuite =
    r.matchQsuite === true
      ? {
          kind: "match",
          headline: "Qsuite matches",
          apiLabel: yn(api),
          tailLabel: yn(tail),
          registration: reg,
        }
      : r.matchQsuite === false
        ? {
            kind: "mismatch",
            headline: "Qsuite does not match",
            apiLabel: yn(api),
            tailLabel: yn(tail),
            registration: reg,
          }
        : {
            kind: "inconclusive",
            headline: "Qsuite unclear",
            apiLabel: yn(api),
            tailLabel: yn(tail),
            registration: reg,
          };

  const ev = equipmentVerdict(r.plannedEquipment, r.actualAircraftCell);
  const equipAligned = r.matchEquipment ?? ev.aligned;
  let equipBody = ev.line;
  if (r.actualEquipment?.trim()) {
    equipBody = `Live aircraft (from tracking): ${r.actualEquipment.trim()}. ${ev.line}`;
  }

  let primaryTitle: string;
  let primaryTint: CompareBriefing["primaryTint"];
  if (!legacy && overall !== null) {
    if (overall) {
      primaryTitle = "Schedule and live data agree";
      primaryTint = "mint";
    } else {
      primaryTitle = "Schedule and live data differ";
      primaryTint = "rose";
    }
  } else {
    primaryTitle = qsuite.headline;
    primaryTint =
      qsuite.kind === "match" ? "mint" : qsuite.kind === "mismatch" ? "rose" : "amber";
  }

  const footnote = legacy
    ? "Run the check again after updating—aircraft type from live tracking is not stored on this row yet, so the badge only reflects Qsuite."
    : "Status shows Aligned when Qsuite from the airline matches the aircraft list and the aircraft family matches between your schedule and live tracking.";

  return {
    primaryTitle,
    primaryTint,
    qsuite,
    equipment: { aligned: equipAligned, body: equipBody },
    footnote,
  };
}

/**
 * Plain sentence (e.g. screen readers or logs).
 */
export function compareHoverExplanation(r: CompareExplainInput): string {
  const b = buildCompareBriefing(r);
  const reg = b.qsuite.registration ? ` ${b.qsuite.registration}` : "";
  const q =
    b.qsuite.kind === "match"
      ? `Qsuite: aligned — airline ${b.qsuite.apiLabel}; this aircraft${reg} (${b.qsuite.tailLabel}).`
      : b.qsuite.kind === "mismatch"
        ? `Qsuite: not aligned — airline ${b.qsuite.apiLabel} vs this aircraft${reg} (${b.qsuite.tailLabel}).`
        : `Qsuite: unclear (airline ${b.qsuite.apiLabel}, this aircraft ${b.qsuite.tailLabel}).`;
  const equip =
    r.matchEquipment === null ? "" : ` Aircraft type (saved): ${r.matchEquipment ? "aligned" : "not aligned"}.`;
  return `${b.primaryTitle}. ${q}${equip} ${b.equipment.body} ${b.footnote}`;
}
