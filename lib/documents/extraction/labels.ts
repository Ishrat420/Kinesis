import { findDates, type DateOrder } from "./dates";

/**
 * Printed labels ("Expiry", "Date of issue", "Licence No.") and the value
 * beside or under them (KD-016, ADR-017).
 *
 * A value is only taken from the same line as its label, after it, or from
 * the very next line when the label ends its own line (the card layout:
 * label above, value below). Two different readings of the same field are a
 * disagreement, not a choice, so neither is suggested.
 */

const EXPIRY_LABEL = /\b(?:date\s+of\s+expiry|expiry\s+date|expiration\s+date|date\s+of\s+expiration|expiry|expires(?:\s+on)?|expire|expiration|valid\s+(?:until|to|thru|through)|exp\b\.?|renewal\s+date|due\s+for\s+renewal)\b/gi;
const ISSUE_LABEL = /\b(?:date\s+of\s+issue|issue\s+date|date\s+issued|issued\s+on|issued)\b/gi;
const NUMBER_LABEL = /\b(?:document|passport|licen[cs]e|card|policy|certificate|membership|registration|reference|visa|grant)\s*(?:no\b\.?|number|num\b\.?|#)\s*[:#.-]?\s*/gi;

/** An ID-shaped token: letters, digits, `-` and `/`, with digit-only groups allowed after a space ("1234 5678 9"). */
const NUMBER_TOKEN = /^[A-Z0-9][A-Z0-9/-]*(?: \d+)*/i;

type Labelled = { expiryDate?: string; issueDate?: string; documentNumber?: string };

type Hit = { end: number; index: number };

function hits(line: string, pattern: RegExp): Hit[] {
  pattern.lastIndex = 0;
  const found: Hit[] = [];
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    found.push({ index: match.index, end: match.index + match[0].length });
  }
  return found;
}

/** Nothing but punctuation and spacing follows the label on its line. */
const endsLine = (line: string, end: number) => /^[\s:.\-#]*$/.test(line.slice(end));

/** The one value every candidate agrees on, or nothing. */
function agreed(values: string[]): string | undefined {
  const distinct = new Set(values);
  return distinct.size === 1 ? values[0] : undefined;
}

function datesFor(lines: string[], label: RegExp, order: DateOrder, handled: Set<number>, sameLineOnly = false): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    if (handled.has(i)) return;
    for (const hit of hits(line, label)) {
      const after = findDates(line.slice(hit.end), order);
      if (after.length > 0) {
        values.push(after[0].iso);
      } else if (!sameLineOnly && endsLine(line, hit.end) && i + 1 < lines.length) {
        const below = findDates(lines[i + 1], order);
        if (below.length > 0) values.push(below[0].iso);
      }
    }
  });
  return values;
}

/**
 * The passport-page layout: "Date of issue   Date of expiry" on one line,
 * both dates under them on the next, read in the order the labels are.
 */
function pairedDates(lines: string[], order: DateOrder): { issue: string[]; expiry: string[]; handled: Set<number> } {
  const issue: string[] = [];
  const expiry: string[] = [];
  const handled = new Set<number>();
  lines.forEach((line, i) => {
    const issueHits = hits(line, ISSUE_LABEL);
    const expiryHits = hits(line, EXPIRY_LABEL);
    if (issueHits.length !== 1 || expiryHits.length !== 1 || findDates(line, order).length > 0 || i + 1 >= lines.length) return;
    const below = findDates(lines[i + 1], order);
    if (below.length !== 2) return;
    const issueFirst = issueHits[0].index < expiryHits[0].index;
    issue.push(below[issueFirst ? 0 : 1].iso);
    expiry.push(below[issueFirst ? 1 : 0].iso);
    handled.add(i);
  });
  return { issue, expiry, handled };
}

function numbersFor(lines: string[]): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of hits(line, NUMBER_LABEL)) {
      const source = endsLine(line, hit.end) && i + 1 < lines.length ? lines[i + 1].trim() : line.slice(hit.end);
      const token = NUMBER_TOKEN.exec(source)?.[0].trim();
      if (token && /\d/.test(token) && token.replace(/\s/g, "").length >= 4 && token.length <= 30) values.push(token.toUpperCase());
    }
  });
  return values;
}

export function readLabelledFields(text: string, order: DateOrder): Labelled {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const paired = pairedDates(lines, order);
  const result: Labelled = {
    expiryDate: agreed([...paired.expiry, ...datesFor(lines, EXPIRY_LABEL, order, paired.handled)]),
    // "Issued by <authority>" is common; only a date on the label's own line counts.
    issueDate: agreed([...paired.issue, ...datesFor(lines, ISSUE_LABEL, order, paired.handled, true)]),
    documentNumber: agreed(numbersFor(lines)),
  };
  // An expiry on or before the issue date means one of them was misread.
  if (result.expiryDate && result.issueDate && result.expiryDate <= result.issueDate) {
    delete result.expiryDate;
    delete result.issueDate;
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value)) as Labelled;
}
