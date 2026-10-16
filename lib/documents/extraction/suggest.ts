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
  ["License", /\b(?:driver'?s?|driving|drivers)\s+licen[cs]e\b/i],
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
 * `mrzText` is a second OCR pass restricted to MRZ characters, when there was
 * one. It reads the MRZ better and everything else worse, so only the MRZ is
 * read from it -- and only once the ordinary text has failed to yield one.
 */
export function suggestFields(text: string, locale: string, mrzText?: string): FieldSuggestions {
  const fromText = readMrz(text);
  const mrz = fromText.documentNumber || !mrzText ? fromText : { ...fromText, ...readMrz(mrzText) };
  const labelled = readLabelledFields(text, documentDateOrder(text, dateOrderFor(locale)));
  const type = mrz.type ?? typeFromKeywords(text);

  // The MRZ is check-digit verified, so it wins wherever both read a field.
  const suggestions: FieldSuggestions = {
    type,
    documentNumber: mrz.documentNumber ?? labelled.documentNumber,
    expiryDate: mrz.expiryDate ?? labelled.expiryDate,
    issueDate: labelled.issueDate,
    country: mrz.country,
  };
  // A label-read issue date that lands on or after the verified expiry was misread.
  if (suggestions.issueDate && suggestions.expiryDate && suggestions.issueDate >= suggestions.expiryDate) {
    delete suggestions.issueDate;
  }
  if (type) suggestions.name = mrz.country ? `${type} (${mrz.country})` : type;

  return Object.fromEntries(Object.entries(suggestions).filter(([, value]) => value)) as FieldSuggestions;
}
