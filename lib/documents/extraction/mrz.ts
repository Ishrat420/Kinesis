import { parse, states, type ParseResult } from "mrz";
import { isoDate } from "./dates";

/**
 * The machine-readable zone on passports and ID cards (ICAO 9303): the two
 * or three lines of capitals, digits and `<` at the bottom of the page
 * (KD-016, ADR-017).
 *
 * Every field this reads is guarded by its own check digit, which is what
 * makes it the one source trustworthy enough to pre-fill from a photo. A
 * field whose check digit fails is dropped, never repaired by guesswork --
 * `mrz`'s own autocorrect only touches fields that must be all-digits or
 * all-letters, where `O`/`0` style confusions have exactly one answer.
 */

export type MrzFields = {
  type?: "Passport" | "ID Card" | "Visa";
  documentNumber?: string;
  expiryDate?: string;
  country?: string;
};

/** The layouts as [lines, characters per line]: TD3 (passports), TD2, TD1 (ID cards). */
const LAYOUTS: [number, number][] = [[2, 44], [2, 36], [3, 30]];

/** OCR turns `<` into these often enough to undo them; none can appear in a real MRZ. */
function cleanLine(line: string): string {
  return line.toUpperCase().replace(/«/g, "<<").replace(/[‹(\[{]/g, "<").replace(/\s+/g, "");
}

/** Within two characters of the layout's width: pad or trim the filler at the end. */
function fit(line: string, width: number): string | null {
  if (Math.abs(line.length - width) > 2) return null;
  if (line.length < width) return line.padEnd(width, "<");
  return line.slice(0, width);
}

function candidates(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length >= 28 && /^[A-Z0-9<]+$/.test(line) && line.includes("<"));
}

function tryParse(lines: string[]): ParseResult | null {
  try {
    return parse(lines, { autocorrect: true });
  } catch {
    return null;
  }
}

/** A country as people write it: "Australia", not "United Kingdom of Great Britain and Northern Ireland (the)". */
const COUNTRY_NAMES: Record<string, string> = {
  GBR: "United Kingdom",
  USA: "United States",
  D: "Germany",
};

function countryName(code: string): string | undefined {
  const name = COUNTRY_NAMES[code] ?? (states as Record<string, string>)[code];
  return name?.replace(/\s*\(.*?\)\s*/g, " ").trim() || undefined;
}

function fields(result: ParseResult): MrzFields {
  const valid = (field: string) => result.details.find((detail) => detail.field === field)?.valid === true;
  const out: MrzFields = {};

  if (result.documentNumber && valid("documentNumber") && valid("documentNumberCheckDigit")) {
    out.documentNumber = result.documentNumber;
  }
  const expiry = result.fields.expirationDate;
  if (expiry && valid("expirationDate") && valid("expirationDateCheckDigit")) {
    // YYMMDD; anything still worth tracking expires this century.
    const iso = isoDate(2000 + Number(expiry.slice(0, 2)), Number(expiry.slice(2, 4)), Number(expiry.slice(4, 6)));
    if (iso) out.expiryDate = iso;
  }
  // No check digit covers the issuing state, so it only counts alongside a field that was verified.
  const state = result.fields.issuingState;
  if (state && valid("issuingState") && (out.documentNumber || out.expiryDate)) {
    out.country = countryName(state);
  }
  const code = result.fields.documentCode ?? "";
  if (out.documentNumber || out.expiryDate) {
    if (code.startsWith("P")) out.type = "Passport";
    else if (code.startsWith("V")) out.type = "Visa";
    else if (/^[IAC]/.test(code)) out.type = "ID Card";
  }
  return out;
}

/** Whether the text looks like it holds an MRZ, worth a second, MRZ-only OCR pass. */
export function looksLikeMrz(text: string): boolean {
  return (text.match(/<{2,}/g) ?? []).length >= 2;
}

export function readMrz(text: string): MrzFields {
  const lines = candidates(text);
  for (const [count, width] of LAYOUTS) {
    for (let start = 0; start + count <= lines.length; start++) {
      const window = lines.slice(start, start + count).map((line) => fit(line, width));
      if (window.some((line) => line === null)) continue;
      const result = tryParse(window as string[]);
      if (!result) continue;
      const read = fields(result);
      if (read.documentNumber || read.expiryDate) return read;
    }
  }
  return {};
}
