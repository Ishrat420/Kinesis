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

/**
 * Whole words or phrases only. `\b` is ASCII-only in JavaScript and never
 * fires beside an accented letter ("délivrée"), so the edges are written out
 * -- the leading one as a consumed character rather than a lookbehind, which
 * older iOS Safari can't parse.
 */
const label = (alternatives: string[], tail = "", flags = "giu") =>
  new RegExp(`(?:^|[^\\p{L}\\d])(?:${alternatives.join("|")})(?![\\p{L}\\d])${tail}`, flags);

const EXPIRY_LABEL = label([
  // English, and the US licence code
  "date\\s+of\\s+expiry", "expiry\\s+date", "expiration\\s+date", "date\\s+of\\s+expiration", "expiry", "expires(?:\\s+on)?", "expire",
  "expiration", "valid\\s+(?:until|to|thru|through)", "exp\\.?", "renewal\\s+date", "due\\s+for\\s+renewal",
  // Spanish
  "fecha\\s+de\\s+(?:vencimiento|expiraci[oó]n|caducidad)", "vencimiento", "v[aá]lid[oa]\\s+hasta",
  // French ("Date d'expiration" is covered by "expiration")
  "(?:valable|valide)\\s+jusqu.?\\s*au",
  // German
  "g[uü]ltig\\s+bis", "ablaufdatum",
]);
const ISSUE_LABEL = label([
  "date\\s+of\\s+issue", "issue\\s+date", "date\\s+issued", "issued\\s+on", "issued", "iss",
  "fecha\\s+de\\s+(?:emisi[oó]n|expedici[oó]n)",
  "date\\s+de\\s+d[eé]livrance", "d[eé]livr[eé]e?\\s+le",
  "ausstellungsdatum", "ausgestellt\\s+am",
]);
const NUMBER_LABEL = label([
  "(?:document|passport|licen[cs]e|card|policy|certificate|membership|registration|reference|visa|grant)\\s*(?:no\\.?|number|num\\.?|#)",
  "n[uú]mero\\s+(?:de\\s+)?documento", "num[eé]ro\\s+(?:du\\s+)?document", "(?:passeport|document)\\s+n[o°º]",
  "ausweisnummer", "passnummer", "dokumentennummer",
], "\\s*[:#.-]?\\s*");
/** The US licence code, upper case only ("DL 123456789"): lower-case "dl" is too common a pair of letters. */
const DL_LABEL = label(["DLN?"], "\\s*[:#.-]?\\s*", "gu");

/** An ID-shaped token: letters, digits, `-`, `/` and `.`, with digit-only groups allowed after a space ("1234 5678 9"). */
const NUMBER_TOKEN = /^[A-Z0-9][A-Z0-9/.-]*(?: \d+)*/i;
/** One whole token on a line of its own: the value under a label, beside whatever else OCR saw there. */
const STANDALONE_TOKEN = /^[A-Z0-9][A-Z0-9/.-]*[A-Z0-9]$/i;

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

/** "Date of issue / Date of expiry" over one date: which one it is can't be told, so neither single-label rule reads it. */
const namesBoth = (line: string) => hits(line, ISSUE_LABEL).length > 0 && hits(line, EXPIRY_LABEL).length > 0;

function datesFor(lines: string[], label: RegExp, order: DateOrder, handled: Set<number>, sameLineOnly = false): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    if (handled.has(i) || namesBoth(line)) return;
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

const isNumberShaped = (token: string) => /\d/.test(token) && token.replace(/[\s.]/g, "").length >= 4 && token.length <= 30;

/**
 * The value under a label that ends its line: the one number-shaped token on
 * the next line, ignoring dates and short OCR debris around it. Two or more
 * candidates means a multi-column layout this can't tell apart, so none.
 */
function numberBelow(line: string, order: DateOrder): string | undefined {
  const withoutDates = findDates(line, order).reduceRight((rest, date) => rest.slice(0, date.index) + " " + rest.slice(date.end), line);
  const tokens = withoutDates.split(/\s+/).map((token) => token.replace(/\.$/, "")).filter((token) => STANDALONE_TOKEN.test(token) && isNumberShaped(token) && token.length >= 5);
  return tokens.length === 1 ? tokens[0] : undefined;
}

function numbersFor(lines: string[], order: DateOrder): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of [...hits(line, NUMBER_LABEL), ...hits(line, DL_LABEL)]) {
      const token = endsLine(line, hit.end)
        ? i + 1 < lines.length ? numberBelow(lines[i + 1], order) : undefined
        : NUMBER_TOKEN.exec(line.slice(hit.end))?.[0].trim().replace(/\.$/, "");
      if (token && isNumberShaped(token)) values.push(token.toUpperCase());
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
    documentNumber: agreed(numbersFor(lines, order)),
  };
  // An expiry on or before the issue date means one of them was misread.
  if (result.expiryDate && result.issueDate && result.expiryDate <= result.issueDate) {
    delete result.expiryDate;
    delete result.issueDate;
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value)) as Labelled;
}
