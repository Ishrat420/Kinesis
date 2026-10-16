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
  const texts = Array.isArray(text) ? text : [text];
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
  };
  const type = mrz.type ?? typeFromKeywords(all);
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
  if (type) suggestions.name = mrz.country ? `${type} (${mrz.country})` : type;

  return Object.fromEntries(Object.entries(suggestions).filter(([, value]) => value)) as FieldSuggestions;
}
