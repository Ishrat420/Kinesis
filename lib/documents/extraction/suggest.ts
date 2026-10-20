import { findDeadline, titleOf } from "@/lib/capture/deadline";
import type { CustomFieldValue } from "@/lib/custom-fields/types";
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
/** `notes` carries what acting on it needs: a bill's amount and how to pay it. */
export type TodoSuggestion = { title: string; dueDate?: string; notes?: string };

/**
 * A file's reading, split the way the capture box shows it: the document's
 * fields, the to-do the file asks for (a bill to pay, a notice to act on),
 * and which of the two -- or both -- to pre-select. A suggestion only: the
 * user picks, and the switch says which one was suggested.
 *
 * `details` are what a bill says beyond the document's own fields ("Amount
 * due", "Biller code"): the document keeps them as custom fields, the to-do
 * as its notes, so whichever is saved has them.
 */
export type FileReading = { document: FieldSuggestions; details?: CustomFieldValue[]; todo?: TodoSuggestion; suggested: SaveAs };

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
const BILL = /\b(?:tax\s+invoice|invoice|bill|amount\s+(?:due|payable|owing)|total\s+(?:due|payable)|balance\s+due|bpay|biller\s+code|pay\s+by|payment\s+due)\b/i;
const BPAY = /\bbpay\b/i;
/** Identity documents: a date on them is an expiry, which already drives reminders, never a to-do of its own. */
const IDENTITY_TYPES = new Set<string>(["Passport", "Visa", "License", "ID Card", "Birth Certificate"]);
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
function actionFor(text: string, dueDate: string | undefined, idType: string | undefined, deadline?: { index: number; end: number }): { name?: string; type?: string; todo?: TodoSuggestion; todoOnly?: boolean } {
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
  if (!deadline) return { todo: { title: "Follow up", dueDate } };
  // A letter or an email asking for something by a date: titled like a pasted one, from its
  // subject or the sentence with the date. Mostly a thing to do, so that's what's suggested;
  // kept as a document too, it goes by the same name.
  const title = titleOf(text, deadline) || "Follow up";
  return { name: title, todo: { title, dueDate }, todoOnly: true };
}

/** The bill's payment details, in the order they're paid with. */
function billDetails(labelled: { amountDue?: string; accountName?: string; billerCode?: string; reference?: string }, bpay: boolean, referenceIsNumber: boolean): CustomFieldValue[] {
  const details: [string, string | undefined][] = [
    ["Amount due", labelled.amountDue],
    ["Account name", labelled.accountName],
    ["Biller code", labelled.billerCode],
    [bpay ? "BPAY reference" : "Reference", referenceIsNumber ? undefined : labelled.reference],
  ];
  return details.filter((detail): detail is [string, string] => Boolean(detail[1])).map(([label, value]) => ({ label, value, type: "TEXT" }));
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
/** Today on this device, as YYYY-MM-DD: the default when a caller doesn't pass the owner's own. */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * `today` is the owner's day, YYYY-MM-DD: what a date with no year, or
 * "tomorrow" under an email's Sent line, is read against.
 */
export function readFile(text: string | string[], locale: string, mrzText?: string, today: string = localToday()): FileReading {
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
    amountDue: agreed(readings.map((reading) => reading.amountDue)),
    accountName: agreed(readings.map((reading) => reading.accountName)),
    billerCode: agreed(readings.map((reading) => reading.billerCode)),
    reference: agreed(readings.map((reading) => reading.reference)),
  };
  const keywordType = mrz.type ?? typeFromKeywords(all);
  // A verified MRZ is an identity document; nothing on it is a bill.
  const identity = Boolean(mrz.documentNumber || mrz.expiryDate) || IDENTITY_TYPES.has(keywordType ?? "");
  // No "Due date" label: the date the text asks for in words ("please reply by 12 Nov"),
  // found the way a pasted email's is. Relative dates count only under a Sent line.
  const deadline = identity || labelled.dueDate ? undefined : findDeadline(all, { today, locale, relativeNeedsAnchor: true });
  // Not the expiry (already reminded of), and not before the document was issued (misread, as with a label).
  const usable = deadline && deadline.dueDate !== labelled.expiryDate && !(labelled.issueDate && deadline.dueDate < labelled.issueDate);
  const dueDate = labelled.dueDate ?? (usable ? deadline.dueDate : undefined);
  const action = mrz.documentNumber || mrz.expiryDate ? {} : actionFor(all, dueDate, keywordType, labelled.dueDate ? undefined : deadline);
  const type = action.type ?? keywordType;
  // A bill paid by BPAY prints its reference beside the biller code; that is how to pay, not what the document is.
  const bpay = Boolean(labelled.billerCode) || BPAY.test(all);
  const referenceIsNumber = !bpay && !labelled.documentNumber && !mrz.documentNumber && Boolean(labelled.reference);
  const documentNumber = mrz.documentNumber ?? crossChecked(labelled.documentNumber ?? (referenceIsNumber ? labelled.reference : undefined), mrz.documentNumberCandidates);
  const details = identity ? [] : billDetails(labelled, bpay, referenceIsNumber);

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
  const notes = details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  const todo = action.todo && notes ? { ...action.todo, notes } : action.todo;
  return {
    document,
    ...(details.length > 0 ? { details } : {}),
    ...(todo ? { todo } : {}),
    suggested: !todo ? "DOCUMENT" : "todoOnly" in action && action.todoOnly ? "TODO" : "BOTH",
  };
}
