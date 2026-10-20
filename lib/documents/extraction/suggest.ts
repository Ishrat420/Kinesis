import { DEFAULT_DOCUMENT_TYPES } from "@/lib/documents/types";
import { dateOrderFor, documentDateOrder } from "./dates";
import { readLabelledFields } from "./labels";
import { readMrz } from "./mrz";

/**
 * Text read from a document, turned into suggestions for the create form
 * (KD-016, ADR-017). Suggestions only: the user checks and saves them like
 * anything typed, through the same server validation.
 */

export type SuggestedField = "name" | "type" | "documentNumber" | "expiryDate" | "issueDate" | "country";
export type FieldSuggestions = Partial<Record<SuggestedField, string>>;

/** What the capture box offers to save a file as (KD-057, ADR-018). */
export type SaveAs = "TODO" | "DOCUMENT" | "BOTH";
export type TodoSuggestion = { title: string; dueDate?: string };

/**
 * A file's reading, split the way the capture box shows it: the document's
 * fields, the to-do the file asks for (a bill to pay, a notice to act on),
 * and which of the two -- or both -- to pre-select. A suggestion only: the
 * user picks, and the switch says which one was suggested.
 */
export type FileReading = { document: FieldSuggestions; todo?: TodoSuggestion; suggested: SaveAs };

type DocumentType = (typeof DEFAULT_DOCUMENT_TYPES)[number];

const TYPE_KEYWORDS: [DocumentType, RegExp][] = [
  ["Passport", /\bpassport\b/i],
  ["Visa", /\bvisa\b/i],
  // The card's own field labels count too: its "DRIVER LICENCE" header is often white on a dark band, which OCR loses.
  ["License", /\b(?:(?:driver'?s?|driving|drivers)\s+licen[cs]e|licen[cs]e\s*(?:no\b|number|expiry|type|class))/i],
  ["ID Card", /\b(?:identity|id)\s+card\b/i],
  ["Birth Certificate", /\bbirth\s+certificate\b/i],
  ["Lease", /\b(?:lease\s+agreement|residential\s+tenancy)\b/i],
];

/** Something to pay. */
const BILL = /\b(?:tax\s+invoice|invoice|bill|amount\s+due|total\s+due|bpay|biller\s+code|pay\s+by|payment\s+due)\b/i;
/** Something to renew. */
const RENEWAL = /\brenew(?:al)?\b/i;
/** What a bill or notice is for, named only when exactly one is mentioned ("electricity and gas" names neither). */
const SUBJECTS: [RegExp, string][] = [
  [/\belectricity\b/i, "Electricity"],
  [/\bgas\b/i, "Gas"],
  [/\bwater\b/i, "Water"],
  [/\b(?:internet|broadband|nbn)\b/i, "Internet"],
  [/\b(?:mobile|phone)\b/i, "Phone"],
  [/\bcouncil\s+rates\b|\brates\s+notice\b/i, "Council rates"],
  [/\b(?:vehicle|car|motor)\s+registration\b|\brego\b/i, "Car registration"],
  [/\binsurance\b/i, "Insurance"],
];

function subjectOf(text: string): string | undefined {
  const found = SUBJECTS.filter(([pattern]) => pattern.test(text));
  return found.length === 1 ? found[0][1] : undefined;
}

/**
 * The to-do a document asks for, when it gives a date to act by. Its title is
 * generated ("Pay electricity bill", "Renew car registration") and shown in
 * the card, where it can be changed before saving.
 */
function actionFor(text: string, dueDate: string | undefined, idType: string | undefined): { name?: string; type?: string; todo?: TodoSuggestion } {
  if (!dueDate) return {};
  const subject = subjectOf(text);
  if (RENEWAL.test(text)) {
    const thing = subject ?? (idType === "License" ? "Licence" : idType);
    return {
      name: thing ? `${thing} renewal notice` : "Renewal notice",
      type: "Notice",
      todo: { title: thing ? `Renew ${thing.toLowerCase()}` : "Renew", dueDate },
    };
  }
  if (BILL.test(text)) {
    const name = subject ? `${subject} bill` : "Bill";
    return { name, type: "Bill", todo: { title: `Pay ${name.toLowerCase()}`, dueDate } };
  }
  return { todo: { title: "Follow up", dueDate } };
}

/** A type only when exactly one kind of document is named: a visa letter that mentions a passport is ambiguous. */
function typeFromKeywords(text: string): DocumentType | undefined {
  const matches = TYPE_KEYWORDS.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : undefined;
}

/**
 * The number printed on the page, checked against an MRZ that couldn't settle
 * its own: kept when the MRZ's check digit vouches for it, dropped when it
 * contradicts every reading the check digit allows. With no such MRZ it
 * stands as read, marked for checking like any suggestion.
 */
function crossChecked(printed: string | undefined, mrzCandidates: string[] | undefined): string | undefined {
  if (!printed || !mrzCandidates) return printed;
  return mrzCandidates.includes(printed.replace(/[\s.-]/g, "")) ? printed : undefined;
}

/** Per reading. Bounds the work the rules can be made to do by a hostile file. */
const MAX_TEXT_CHARACTERS = 50_000;

/** The one value every reading that has one agrees on; readings that disagree leave the field blank. */
function agreed(values: (string | undefined)[]): string | undefined {
  const present = new Set(values.filter((value): value is string => Boolean(value)));
  return present.size === 1 ? [...present][0] : undefined;
}

/**
 * `text` may be several OCR readings of the same page (the image as it is,
 * and with its background flattened): each catches print the other loses, so
 * a field is taken from whichever reading has it, and left blank when two
 * readings disagree.
 *
 * `mrzText` is a second OCR pass restricted to MRZ characters, when there was
 * one. It reads the MRZ better and everything else worse, so only the MRZ is
 * read from it.
 */
export function suggestFields(text: string | string[], locale: string, mrzText?: string): FieldSuggestions {
  return readFile(text, locale, mrzText).document;
}

/** The whole reading: document fields, the to-do the file asks for, and which to pre-select. */
export function readFile(text: string | string[], locale: string, mrzText?: string): FileReading {
  // Three pages of OCR is a few thousand characters; anything far beyond that is not a document to fill a form from.
  const texts = (Array.isArray(text) ? text : [text]).map((reading) => reading.slice(0, MAX_TEXT_CHARACTERS));
  const all = texts.join("\n");
  // The first reading whose MRZ verified a number, else one that verified anything.
  const mrzReads = [...texts, ...(mrzText ? [mrzText] : [])].map(readMrz);
  const mrz = mrzReads.find((read) => read.documentNumber) ?? mrzReads.find((read) => read.expiryDate) ?? {};
  const order = documentDateOrder(all, dateOrderFor(locale));
  const readings = texts.map((reading) => readLabelledFields(reading, order));
  const labelled = {
    documentNumber: agreed(readings.map((reading) => reading.documentNumber)),
    expiryDate: agreed(readings.map((reading) => reading.expiryDate)),
    issueDate: agreed(readings.map((reading) => reading.issueDate)),
    dueDate: agreed(readings.map((reading) => reading.dueDate)),
  };
  const keywordType = mrz.type ?? typeFromKeywords(all);
  // A verified MRZ is an identity document; nothing on it is a bill.
  const action = mrz.documentNumber || mrz.expiryDate ? {} : actionFor(all, labelled.dueDate, keywordType);
  const type = action.type ?? keywordType;
  const documentNumber = mrz.documentNumber ?? crossChecked(labelled.documentNumber, mrz.documentNumberCandidates);

  // The MRZ is check-digit verified, so it wins wherever both read a field.
  const suggestions: FieldSuggestions = {
    type,
    documentNumber,
    expiryDate: mrz.expiryDate ?? labelled.expiryDate,
    issueDate: labelled.issueDate,
    country: mrz.country,
  };
  // A label-read issue date that lands on or after the expiry was misread.
  if (suggestions.issueDate && suggestions.expiryDate && suggestions.issueDate >= suggestions.expiryDate) {
    delete suggestions.issueDate;
  }
  if (action.name) suggestions.name = action.name;
  else if (type) suggestions.name = mrz.country ? `${type} (${mrz.country})` : type;

  const document = Object.fromEntries(Object.entries(suggestions).filter(([, value]) => value)) as FieldSuggestions;
  return { document, ...(action.todo ? { todo: action.todo } : {}), suggested: action.todo ? "BOTH" : "DOCUMENT" };
}
