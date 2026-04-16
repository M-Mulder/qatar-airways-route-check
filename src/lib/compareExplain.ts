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

/** Schedule row: what the airline API says about Qsuite for this segment. */
function scheduleQsuitePhrase(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v ? "Marked as Qsuite" : "Not marked as Qsuite";
}

/** Tail row: Qatar Qsuite tail registry (not a cabin guarantee). */
function tailQsuitePhrase(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "Unknown";
  return v ? "In Qsuite tail list" : "Not in Qsuite tail list";
}

function equipmentVerdict(
  planned: string | null,
  cell: string | null,
): { line: string; aligned: boolean | null } {
  const p = (planned ?? "").trim();
  const c = (cell ?? "").trim();
  if (!p && !c)
    return { line: "Aircraft type: nothing on your schedule and nothing readable from the comparison.", aligned: null };
  if (!p) return { line: `Aircraft type: missing on your schedule; recorded data shows “${truncate(c, 48)}”.`, aligned: null };
  if (!c) return { line: `Aircraft type: your schedule says ${p}; no usable aircraft line was available for that flight.`, aligned: null };

  const pc = equipmentCategory(p);
  const cc = equipmentCategory(c);
  if (pc && cc) {
    if (pc === cc) return { line: `Aircraft type: matches your schedule (${pc}).`, aligned: true };
    return {
      line: `Aircraft type: differs — schedule ${p} (${pc}) vs operated “${truncate(c, 40)}” (${cc}).`,
      aligned: false,
    };
  }

  const loose = c.toUpperCase().includes(p.toUpperCase()) || p.toUpperCase().includes(c.toUpperCase().slice(0, 6));
  if (loose) return { line: `Aircraft type: likely matches (schedule ${p}; operated “${truncate(c, 40)}”).`, aligned: true };
  return {
    line: `Aircraft type: unclear — schedule ${p} vs operated “${truncate(c, 40)}”.`,
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
  /** Human-readable schedule-side Qsuite flag. */
  scheduleQsuiteText: string;
  /** Human-readable tail-list Qsuite line (registration shown separately in UI when known). */
  tailQsuiteText: string;
  registration: string | null;
};

export type CompareBriefingEquipment = {
  aligned: boolean | null;
  /** Schedule equipment string or "—". */
  plannedShort: string;
  /** Parsed live type or raw comparison cell snippet or "—". */
  liveShort: string;
  /** One short outcome line for scanning. */
  verdictShort: string;
};

export type CompareBriefing = {
  /** Hero line (overall plan vs operated when both stored; else Qsuite headline). */
  primaryTitle: string;
  /** `technical` = mono uppercase for schedule-vs-operated; `display` = legacy Qsuite-only headline. */
  titleStyle: "technical" | "display";
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
          scheduleQsuiteText: scheduleQsuitePhrase(api),
          tailQsuiteText: tailQsuitePhrase(tail),
          registration: reg,
        }
      : r.matchQsuite === false
        ? {
            kind: "mismatch",
            headline: "Qsuite does not match",
            scheduleQsuiteText: scheduleQsuitePhrase(api),
            tailQsuiteText: tailQsuitePhrase(tail),
            registration: reg,
          }
        : {
            kind: "inconclusive",
            headline: "Qsuite unclear",
            scheduleQsuiteText: scheduleQsuitePhrase(api),
            tailQsuiteText: tailQsuitePhrase(tail),
            registration: reg,
          };

  const ev = equipmentVerdict(r.plannedEquipment, r.actualAircraftCell);
  const equipAligned = r.matchEquipment ?? ev.aligned;
  const plannedShort = (r.plannedEquipment ?? "").trim() || "—";
  const liveSaved = (r.actualEquipment ?? "").trim();
  const liveCell = truncate((r.actualAircraftCell ?? "").replace(/\s+/g, " ").trim(), 44);
  const liveShort = liveSaved || liveCell || "—";

  let verdictShort: string;
  if (r.matchEquipment === true) verdictShort = "Same family as schedule";
  else if (r.matchEquipment === false) verdictShort = "Differs from schedule";
  else if (ev.aligned === true) verdictShort = "Same family as schedule";
  else if (ev.aligned === false) verdictShort = "Differs from schedule";
  else verdictShort = "Unclear";

  let primaryTitle: string;
  let primaryTint: CompareBriefing["primaryTint"];
  if (!legacy && overall !== null) {
    if (overall) {
      primaryTitle = "Schedule vs operated: aligned";
      primaryTint = "mint";
    } else {
      primaryTitle = "Schedule vs operated: not aligned";
      primaryTint = "rose";
    }
  } else {
    primaryTitle = qsuite.headline;
    primaryTint =
      qsuite.kind === "match" ? "mint" : qsuite.kind === "mismatch" ? "rose" : "amber";
  }

  const footnote = legacy
    ? "Run the check again after updating—operated aircraft type is not stored on this row yet, so the badge only reflects Qsuite."
    : "";

  const titleStyle: CompareBriefing["titleStyle"] =
    !legacy && overall !== null ? "technical" : "display";

  return {
    primaryTitle,
    titleStyle,
    primaryTint,
    qsuite,
    equipment: {
      aligned: equipAligned,
      plannedShort,
      liveShort,
      verdictShort,
    },
    footnote,
  };
}

/**
 * Plain sentence (e.g. screen readers or logs).
 */
export function compareHoverExplanation(r: CompareExplainInput): string {
  const b = buildCompareBriefing(r);
  const regPart = b.qsuite.registration ? ` Registration ${b.qsuite.registration}.` : "";
  const q =
    b.qsuite.kind === "match"
      ? `Qsuite aligned.${regPart} Schedule: ${b.qsuite.scheduleQsuiteText}. Tail list: ${b.qsuite.tailQsuiteText}.`
      : b.qsuite.kind === "mismatch"
        ? `Qsuite not aligned.${regPart} Schedule: ${b.qsuite.scheduleQsuiteText}. Tail list: ${b.qsuite.tailQsuiteText}.`
        : `Qsuite unclear.${regPart} Schedule: ${b.qsuite.scheduleQsuiteText}. Tail list: ${b.qsuite.tailQsuiteText}.`;
  const equip = ` Aircraft: schedule ${b.equipment.plannedShort}, operated ${b.equipment.liveShort}. ${b.equipment.verdictShort}.`;
  const foot = b.footnote ? ` ${b.footnote}` : "";
  return `${b.primaryTitle}. ${q}${equip}${foot}`.replace(/\s+/g, " ").trim();
}
