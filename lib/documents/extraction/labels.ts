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
  "expiration", "valid\\s+(?:until|to|thru|through)", "exp\\.?",
  // Spanish
  "fecha\\s+de\\s+(?:vencimiento|expiraci[oó]n|caducidad)", "vencimiento", "v[aá]lid[oa]\\s+hasta",
  // French ("Date d'expiration" is covered by "expiration")
  "(?:valable|valide)\\s+jusqu.?\\s*au",
  // German
  "g[uü]ltig\\s+bis", "ablaufdatum",
]);
const ISSUE_LABEL = label([
  "date\\s+of\\s+issue", "issue\\s+date", "date\\s+issued", "issued\\s+on", "issued", "iss",
  // Bills and statements (KD-057)
  "(?:bill|invoice|statement)\\s+date", "date\\s+of\\s+(?:bill|invoice|statement)",
  "fecha\\s+de\\s+(?:emisi[oó]n|expedici[oó]n)",
  "date\\s+de\\s+d[eé]livrance", "d[eé]livr[eé]e?\\s+le",
  "ausstellungsdatum", "ausgestellt\\s+am",
]);
/**
 * The date something has to be done by (KD-057): a bill's due date, a
 * notice's renew-by date. It becomes the to-do's due date, never the
 * document's expiry -- "Renewal date" used to be read as an expiry, which
 * on a renewal notice is the wrong field.
 */
const DUE_LABEL = label([
  "due\\s+date", "payment\\s+due(?:\\s+date)?", "(?:please\\s+)?pay\\s+(?:by|before)", "due\\s+(?:by|on)",
  "renew\\s+(?:by|before)", "renewal\\s+(?:date|due)", "due\\s+for\\s+renewal",
]);
const NUMBER_LABEL = label([
  "(?:document|passport|licen[cs]e|card|policy|certificate|membership|registration|visa|grant|account|customer|invoice|bill|client)\\s*(?:no\\.?|number|num\\.?|#)",
  "n[uú]mero\\s+(?:de\\s+)?documento", "num[eé]ro\\s+(?:du\\s+)?document", "(?:passeport|document)\\s+n[o°º]",
  "ausweisnummer", "passnummer", "dokumentennummer",
], "\\s*[:#.-]?\\s*");
/**
 * A bill's payment details (KD-057): what to pay, whose account it is, and
 * the BPAY biller code and reference to pay it with. Kept as the document's
 * own fields and in the to-do's notes, so either one has what paying needs.
 */
const AMOUNT_LABEL = label([
  "(?:total\\s+)?amount\\s+(?:now\\s+)?(?:due|payable|owing|to\\s+pay)", "total\\s+(?:now\\s+)?(?:due|payable|owing|to\\s+pay)",
  "balance\\s+(?:due|owing|payable)", "(?:please\\s+)?pay\\s+this\\s+amount",
], "\\s*[:#.-]?\\s*");
const ACCOUNT_NAME_LABEL = label(["account\\s+name", "account\\s+holder(?:\\s+name)?", "customer\\s+name", "name\\s+on\\s+(?:the\\s+)?account"], "\\s*[:#.-]?\\s*");
const BILLER_CODE_LABEL = label(["biller\\s+code"], "\\s*(?:no\\.?|number)?\\s*[:#.-]?\\s*");
/** "Ref" alone, a CRN, or a reference number: on a bill with a biller code, the BPAY reference. */
const REFERENCE_LABEL = label([
  "(?:customer\\s+|payment\\s+|bpay\\s+)?reference(?:\\s*(?:no\\.?|number|num\\.?|#))?", "(?:bpay\\s+)?ref(?:\\s*(?:no\\.?|number|#))?\\.?", "crn",
], "\\s*[:#.-]?\\s*");

/**
 * Money, with its currency marked ("$182.40", "AUD 1,204.00") or written to
 * the cent ("182.40"). The leading character is consumed, not looked behind,
 * so "12.11.2026" never reads as an amount.
 */
const MONEY = /(?:^|[^\d.,$])(?:(?:A?\$|AUD)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}))(?!\d|[.,]\d)/i;
/** A name: letters and the punctuation names use, no digits. Ends where another label or a wide gap starts. */
const NAME_VALUE = /^[\p{L}][\p{L} .,'&-]{1,59}/u;
const NAME_STOP = /\s{2,}|\t|\s(?:account|customer|invoice|biller|reference|ref|crn|bill|due|amount|date|issue|total|balance|period|abn|tax)\b/i;

/** The US licence code, upper case only ("DL 123456789"): lower-case "dl" is too common a pair of letters. */
const DL_LABEL = label(["DLN?"], "\\s*[:#.-]?\\s*", "gu");

/** An ID-shaped token: letters, digits, `-`, `/` and `.`, with digit-only groups allowed after a space ("1234 5678 9"). */
const NUMBER_TOKEN = /^[A-Z0-9][A-Z0-9/.-]*(?: \d+)*/i;
/** One whole token on a line of its own: the value under a label, beside whatever else OCR saw there. */
const STANDALONE_TOKEN = /^[A-Z0-9][A-Z0-9/.-]*[A-Z0-9]$/i;

/**
 * How far past a label its value may be, in characters. Wide enough for any
 * real layout; it also keeps the work linear: on a line of nothing but labels,
 * each one reading the whole rest of its line took 30 s for 200 KB of text.
 */
const VALUE_WINDOW = 80;

type Labelled = {
  expiryDate?: string; issueDate?: string; documentNumber?: string; dueDate?: string;
  amountDue?: string; accountName?: string; billerCode?: string; reference?: string;
};

type Hit = { end: number; index: number; text: string };

function hits(line: string, pattern: RegExp): Hit[] {
  pattern.lastIndex = 0;
  const found: Hit[] = [];
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    found.push({ index: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return found;
}

/**
 * Nothing but punctuation and spacing follows the label on its line -- or one
 * or two stray characters with no digit among them, which is OCR seeing a
 * speck of the background ("DOCUMENT No. x").
 */
const endsLine = (line: string, end: number) => {
  const rest = line.slice(end).replace(/[\s:.\-#]/g, "");
  return rest.length === 0 || (rest.length <= 2 && !/\d/.test(rest));
};
/** "Issued by <authority>" is common: the bare word only counts with its date on the same line. */
const BARE_ISSUED = /^(?:[^\p{L}\d])?(?:issued|iss)$/iu;

/** The one value every candidate agrees on, or nothing. */
function agreed(values: string[]): string | undefined {
  const distinct = new Set(values);
  return distinct.size === 1 ? values[0] : undefined;
}

/** "Date of issue / Date of expiry" over one date: which one it is can't be told, so neither single-label rule reads it. */
const namesBoth = (line: string) => hits(line, ISSUE_LABEL).length > 0 && hits(line, EXPIRY_LABEL).length > 0;

/** `sameLineOnly` picks out labels whose date must be on their own line, never the one below. */
function datesFor(lines: string[], label: RegExp, order: DateOrder, handled: Set<number>, sameLineOnly: (label: string) => boolean = () => false): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    if (handled.has(i) || namesBoth(line)) return;
    for (const hit of hits(line, label)) {
      const after = findDates(line.slice(hit.end, hit.end + VALUE_WINDOW), order);
      if (after.length > 0) {
        values.push(after[0].iso);
      } else if (!sameLineOnly(hit.text) && endsLine(line, hit.end) && i + 1 < lines.length) {
        const below = findDates(lines[i + 1], order);
        if (below.length > 0) values.push(below[0].iso);
      }
    }
  });
  return values;
}

/**
 * Never suggested -- Kinesis doesn't track it -- but a date of birth sits
 * beside the expiry on most cards, and knowing which column it heads is what
 * tells the two dates under them apart.
 */
const BIRTH_LABEL = label([
  "date\\s+of\\s+birth", "birth\\s+date", "dob",
  "fecha\\s+de\\s+nacimiento", "date\\s+de\\s+naissance", "geburtsdatum",
]);

/**
 * Column headers over their dates: "Date of issue   Date of expiry", or a
 * licence's "LICENCE EXPIRY   DATE OF BIRTH", on one line, with the dates in
 * the same order on the next. Only when the line has no date of its own and
 * the count of dates below matches the count of headers exactly.
 */
function pairedDates(lines: string[], order: DateOrder): { issue: string[]; expiry: string[]; due: string[]; handled: Set<number> } {
  const issue: string[] = [];
  const expiry: string[] = [];
  const due: string[] = [];
  const handled = new Set<number>();
  lines.forEach((line, i) => {
    if (i + 1 >= lines.length || findDates(line, order).length > 0) return;
    const headers = [
      ...hits(line, ISSUE_LABEL).map((hit) => ({ ...hit, kind: "issue" as const })),
      ...hits(line, EXPIRY_LABEL).map((hit) => ({ ...hit, kind: "expiry" as const })),
      ...hits(line, DUE_LABEL).map((hit) => ({ ...hit, kind: "due" as const })),
      ...hits(line, BIRTH_LABEL).map((hit) => ({ ...hit, kind: "birth" as const })),
    ].sort((a, b) => a.index - b.index);
    const kinds = new Set(headers.map((header) => header.kind));
    // "Date of issue / Date d'expiration" is two names for one column, not two columns.
    if (headers.length < 2 || kinds.size !== headers.length) return;
    const below = findDates(lines[i + 1], order);
    if (below.length !== headers.length) return;
    headers.forEach((header, column) => {
      if (header.kind === "issue") issue.push(below[column].iso);
      if (header.kind === "expiry") expiry.push(below[column].iso);
      if (header.kind === "due") due.push(below[column].iso);
    });
    handled.add(i);
  });
  return { issue, expiry, due, handled };
}

const isNumberShaped = (token: string) => /\d/.test(token) && token.replace(/[\s.]/g, "").length >= 4 && token.length <= 30;

/**
 * The value under a label that ends its line: the one number-shaped token on
 * a line below it, ignoring dates and short OCR debris around it. Two or more
 * candidates means a multi-column layout this can't tell apart, so none.
 */
function numberBelow(line: string, order: DateOrder): string | undefined {
  const withoutDates = findDates(line, order).reduceRight((rest, date) => rest.slice(0, date.index) + " " + rest.slice(date.end), line);
  // OCR reads a leading S as "$" often enough to undo it; no document number starts with "$".
  const tokens = withoutDates.split(/\s+/).map((token) => token.replace(/\.$/, "").replace(/^\$/, "S")).filter((token) => STANDALONE_TOKEN.test(token) && isNumberShaped(token) && token.length >= 5);
  return tokens.length === 1 ? tokens[0] : undefined;
}

function numbersFor(lines: string[], order: DateOrder): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of [...hits(line, NUMBER_LABEL), ...hits(line, DL_LABEL)]) {
      // Up to two lines down: passports print "Type / Code of issuing State" between the label and its number.
      const token = endsLine(line, hit.end)
        ? (lines[i + 1] !== undefined ? numberBelow(lines[i + 1], order) : undefined) ?? (lines[i + 2] !== undefined ? numberBelow(lines[i + 2], order) : undefined)
        : NUMBER_TOKEN.exec(line.slice(hit.end, hit.end + VALUE_WINDOW))?.[0].trim().replace(/\.$/, "");
      if (token && isNumberShaped(token)) values.push(token.toUpperCase());
    }
  });
  return values;
}

function moneyIn(text: string): string | undefined {
  const match = MONEY.exec(text);
  if (!match) return undefined;
  return match[1] !== undefined ? `$${match[1]}` : match[2];
}

/** The amount beside its label, or -- in a column layout, "Amount due   Due date" -- the one amount on the line below. */
function amountsFor(lines: string[]): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of hits(line, AMOUNT_LABEL)) {
      const beside = moneyIn(line.slice(hit.end, hit.end + VALUE_WINDOW));
      if (beside) { values.push(beside); continue; }
      const next = lines[i + 1];
      if (next === undefined) continue;
      const below = [...next.matchAll(new RegExp(MONEY.source, "gi"))];
      if (below.length === 1) values.push(moneyIn(below[0][0])!);
    }
  });
  return values;
}

function accountNamesFor(lines: string[]): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of hits(line, ACCOUNT_NAME_LABEL)) {
      const source = endsLine(line, hit.end) ? lines[i + 1] ?? "" : line.slice(hit.end, hit.end + VALUE_WINDOW);
      const stop = NAME_STOP.exec(source);
      const name = NAME_VALUE.exec((stop ? source.slice(0, stop.index) : source).trim())?.[0].replace(/[\s,.-]+$/, "").trim();
      if (name && name.length >= 2) values.push(name);
    }
  });
  return values;
}

/** A biller code is three to ten digits, beside its label or alone on the line below. */
function billerCodesFor(lines: string[]): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of hits(line, BILLER_CODE_LABEL)) {
      const source = endsLine(line, hit.end) ? lines[i + 1] ?? "" : line.slice(hit.end, hit.end + VALUE_WINDOW);
      const code = /^\d{3,10}(?!\d)/.exec(source.trim())?.[0];
      if (code) values.push(code);
    }
  });
  return values;
}

/** A reference keeps its letters (a policy's "AB-1234"); a digits-only one loses the spaces it was printed with. */
function referencesFor(lines: string[]): string[] {
  const values: string[] = [];
  lines.forEach((line, i) => {
    for (const hit of hits(line, REFERENCE_LABEL)) {
      const source = endsLine(line, hit.end) ? lines[i + 1] ?? "" : line.slice(hit.end, hit.end + VALUE_WINDOW);
      const token = NUMBER_TOKEN.exec(source.trim())?.[0].trim().replace(/\.$/, "");
      if (!token || !isNumberShaped(token)) continue;
      values.push(/^[\d ]+$/.test(token) ? token.replace(/ /g, "") : token.toUpperCase());
    }
  });
  return values;
}

export function readLabelledFields(text: string, order: DateOrder): Labelled {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const paired = pairedDates(lines, order);
  const result: Labelled = {
    expiryDate: agreed([...paired.expiry, ...datesFor(lines, EXPIRY_LABEL, order, paired.handled)]),
    issueDate: agreed([...paired.issue, ...datesFor(lines, ISSUE_LABEL, order, paired.handled, (label) => BARE_ISSUED.test(label.trim()))]),
    documentNumber: agreed(numbersFor(lines, order)),
    dueDate: agreed([...paired.due, ...datesFor(lines, DUE_LABEL, order, paired.handled)]),
    amountDue: agreed(amountsFor(lines)),
    accountName: agreed(accountNamesFor(lines)),
    billerCode: agreed(billerCodesFor(lines)),
    reference: agreed(referencesFor(lines)),
  };
  // A due date before the bill was even issued was misread.
  if (result.dueDate && result.issueDate && result.dueDate < result.issueDate) delete result.dueDate;
  // An expiry on or before the issue date means one of them was misread.
  if (result.expiryDate && result.issueDate && result.expiryDate <= result.issueDate) {
    delete result.expiryDate;
    delete result.issueDate;
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value)) as Labelled;
}
