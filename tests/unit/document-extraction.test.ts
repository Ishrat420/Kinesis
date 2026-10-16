import { describe, expect, it } from "vitest";
import { dateOrderFor, documentDateOrder, findDates } from "@/lib/documents/extraction/dates";
import { readLabelledFields } from "@/lib/documents/extraction/labels";
import { looksLikeMrz, readMrz } from "@/lib/documents/extraction/mrz";
import { suggestFields } from "@/lib/documents/extraction/suggest";
import { sniffFileKind } from "@/lib/documents/extraction/file-kind";

/**
 * KD-016 / ADR-017. The OCR engine itself isn't under test here -- these are
 * the rules that turn its text into suggestions, and the rule that matters
 * most is "blank, not wrong".
 */

// ICAO 9303 specimen passport, re-issued by Australia so the issuing state is
// real: same holder and dates, check digits recomputed for the new state.
const PASSPORT_MRZ = [
  "P<AUSERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
  "L898902C36AUS7408122F1204159<<<<<<<<<<<<<<08",
];

const iso = (text: string, locale = "en-AU") => findDates(text, dateOrderFor(locale)).map((date) => date.iso);

describe("dateOrderFor", () => {
  it("reads the order from the locale", () => {
    expect(dateOrderFor("en-AU")).toBe("DMY");
    expect(dateOrderFor("en-US")).toBe("MDY");
    expect(dateOrderFor("sv-SE")).toBe("YMD");
  });
});

describe("findDates", () => {
  it("reads ISO, numeric and month-name dates", () => {
    expect(iso("2027-04-03")).toEqual(["2027-04-03"]);
    expect(iso("03/04/2027")).toEqual(["2027-04-03"]);
    expect(iso("03.04.27")).toEqual(["2027-04-03"]);
    expect(iso("03 APR 2027")).toEqual(["2027-04-03"]);
    expect(iso("03APR2027")).toEqual(["2027-04-03"]);
    expect(iso("03 APR /AVR 27")).toEqual(["2027-04-03"]);
    expect(iso("3rd April 2027")).toEqual(["2027-04-03"]);
    expect(iso("April 3, 2027")).toEqual(["2027-04-03"]);
    expect(iso("Sept 3 2027")).toEqual(["2027-09-03"]);
  });

  it("settles an ambiguous numeric date by the locale", () => {
    expect(iso("03/04/2027", "en-AU")).toEqual(["2027-04-03"]);
    expect(iso("03/04/2027", "en-US")).toEqual(["2027-03-04"]);
  });

  it("lets a part over 12 decide, whatever the locale", () => {
    expect(iso("04/23/2027", "en-AU")).toEqual(["2027-04-23"]);
    expect(iso("23/04/2027", "en-US")).toEqual(["2027-04-23"]);
  });

  it("drops dates that don't exist and words that only look like months", () => {
    expect(iso("31/02/2027")).toEqual([]);
    expect(iso("13/13/2027")).toEqual([]);
    expect(iso("03 Marchxyz 2027")).toEqual([]);
    expect(iso("12 May be 2027")).toEqual([]);
  });

  it("finds every date on a line, left to right", () => {
    expect(iso("01 JAN 2020    01 JAN 2030")).toEqual(["2020-01-01", "2030-01-01"]);
  });
});

describe("readLabelledFields", () => {
  const read = (text: string) => readLabelledFields(text, "DMY");

  it("reads a value on the label's own line", () => {
    expect(read("Expiry: 03/04/2027\nDate of issue: 03/04/2017")).toEqual({ expiryDate: "2027-04-03", issueDate: "2017-04-03" });
  });

  it("reads the line below a label that ends its line", () => {
    expect(read("Expiry\n03/04/2027")).toMatchObject({ expiryDate: "2027-04-03" });
    expect(read("Licence No.\n12345678")).toMatchObject({ documentNumber: "12345678" });
  });

  it("pairs a two-label line with the two dates below it", () => {
    expect(read("Date of issue    Date of expiry\n01 JAN 2020    01 JAN 2030")).toEqual({ issueDate: "2020-01-01", expiryDate: "2030-01-01" });
  });

  it("doesn't take a date from under 'Issued by'", () => {
    expect(read("Issued by\n01/01/2020")).toEqual({});
  });

  it("leaves a field blank when two readings disagree", () => {
    expect(read("Expiry: 03/04/2027\nValid until 03/05/2027")).toEqual({});
  });

  it("keeps a field when every reading agrees", () => {
    expect(read("Expiry: 03/04/2027\nValid until 3 April 2027")).toEqual({ expiryDate: "2027-04-03" });
  });

  it("drops both dates when the expiry isn't after the issue date", () => {
    expect(read("Expiry: 01/01/2020\nIssue date: 01/01/2025")).toEqual({});
  });

  it("reads document numbers, including digit groups", () => {
    expect(read("Policy number: HOM-1234567")).toEqual({ documentNumber: "HOM-1234567" });
    expect(read("Card number 1234 5678 9")).toEqual({ documentNumber: "1234 5678 9" });
  });

  it("ignores number labels with nothing number-shaped after them", () => {
    expect(read("Licence number: see over")).toEqual({});
    expect(read("Policy no. 12")).toEqual({});
  });

  it("doesn't read 'exp' inside other words", () => {
    expect(read("Expenses 03/04/2027")).toEqual({});
  });
});

describe("readMrz", () => {
  it("reads a passport MRZ", () => {
    expect(readMrz(PASSPORT_MRZ.join("\n"))).toEqual({
      type: "Passport",
      documentNumber: "L898902C3",
      expiryDate: "2012-04-15",
      country: "Australia",
    });
  });

  it("finds the MRZ among other text and undoes OCR's spacing and `<` confusions", () => {
    const noisy = `AUSTRALIA PASSPORT\nSurname ERIKSSON\n${PASSPORT_MRZ[0].replace("<<ANNA", "« ANNA")}\n${PASSPORT_MRZ[1].replace("<<<<", "<(<<")}`;
    expect(readMrz(noisy)).toMatchObject({ documentNumber: "L898902C3", expiryDate: "2012-04-15" });
  });

  it("drops the document number when its check digit fails", () => {
    const misread = PASSPORT_MRZ[1].replace("L898902C3", "L898902G3");
    expect(readMrz(`${PASSPORT_MRZ[0]}\n${misread}`)).toEqual({
      type: "Passport",
      expiryDate: "2012-04-15",
      country: "Australia",
    });
  });

  it("drops the expiry when its check digit fails", () => {
    const misread = PASSPORT_MRZ[1].replace("1204159", "1204169");
    expect(readMrz(`${PASSPORT_MRZ[0]}\n${misread}`)).not.toHaveProperty("expiryDate");
  });

  it("reads nothing from text without an MRZ", () => {
    expect(readMrz("Driver Licence\nExpiry 03/04/2027")).toEqual({});
  });

  it("spots an MRZ worth a second OCR pass", () => {
    expect(looksLikeMrz(PASSPORT_MRZ.join("\n"))).toBe(true);
    expect(looksLikeMrz("Expiry 03/04/2027")).toBe(false);
  });
});

describe("suggestFields", () => {
  it("prefers the verified MRZ and names the document from it", () => {
    const text = `Date of issue 15 APR 2002\nDate of expiry 15 APR 2013\n${PASSPORT_MRZ.join("\n")}`;
    expect(suggestFields(text, "en-AU")).toEqual({
      name: "Passport (Australia)",
      type: "Passport",
      documentNumber: "L898902C3",
      expiryDate: "2012-04-15",
      issueDate: "2002-04-15",
      country: "Australia",
    });
  });

  it("falls back to labels and keywords for documents without an MRZ", () => {
    expect(suggestFields("NSW Driver Licence\nLicence No. 12345678\nExpiry 03/04/2027", "en-AU")).toEqual({
      name: "License",
      type: "License",
      documentNumber: "12345678",
      expiryDate: "2027-04-03",
    });
  });

  it("names no type when the text mentions more than one kind of document", () => {
    expect(suggestFields("Visa grant notice. Passport number: PA1234567", "en-AU")).toEqual({ documentNumber: "PA1234567" });
  });

  it("suggests nothing from text with nothing recognisable", () => {
    expect(suggestFields("Thank you for your purchase", "en-AU")).toEqual({});
  });
});

describe("suggestFields with an MRZ-only pass", () => {
  it("reads the MRZ from the second pass when the first one garbled it", () => {
    const garbled = `${PASSPORT_MRZ[0]}\n${PASSPORT_MRZ[1].replace("L898902C3", "L8989O2C3")}`;
    expect(suggestFields(`Expiry 01/01/2031\n${garbled}`, "en-AU", PASSPORT_MRZ.join("\n"))).toMatchObject({
      documentNumber: "L898902C3",
      expiryDate: "2012-04-15",
    });
  });

  it("reads nothing but the MRZ from the second pass", () => {
    expect(suggestFields("", "en-AU", "EXPIRY 03/04/2027")).toEqual({});
  });
});

describe("sniffFileKind", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it("knows PDF, PNG and JPEG by their first bytes", () => {
    expect(sniffFileKind(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(sniffFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(sniffFileKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  });

  it("refuses anything else, whatever it is named", () => {
    expect(sniffFileKind(new TextEncoder().encode("<html>"))).toBeNull();
    expect(sniffFileKind(bytes())).toBeNull();
  });
});

describe("documentDateOrder", () => {
  it("follows a date on the document that can only be read one way", () => {
    expect(documentDateOrder("DOB 09/25/1993\nEXP 07/11/2025", "DMY")).toBe("MDY");
    expect(documentDateOrder("Born 25/09/1993\nExpiry 07/11/2025", "MDY")).toBe("DMY");
  });

  it("falls back to the locale when the document doesn't say, or says both", () => {
    expect(documentDateOrder("EXP 07/11/2025", "DMY")).toBe("DMY");
    expect(documentDateOrder("25/09/1993 09/25/1993", "MDY")).toBe("MDY");
  });
});

describe("more label languages and layouts", () => {
  const read = (text: string) => readLabelledFields(text, "DMY");

  it("reads Spanish, French and German labels", () => {
    expect(read("FECHA DE VENCIMIENTO: 15 SEP 2027")).toEqual({ expiryDate: "2027-09-15" });
    expect(read("Fecha de emisión 14/04/2017")).toEqual({ issueDate: "2017-04-14" });
    expect(read("Date de délivrance : 01.02.2020")).toEqual({ issueDate: "2020-02-01" });
    expect(read("Gültig bis 01.02.2030")).toEqual({ expiryDate: "2030-02-01" });
    expect(read("Número documento: 728.628.513")).toEqual({ documentNumber: "728.628.513" });
  });

  it("reads the US licence codes", () => {
    expect(read("DL 123456789 CLASS C\nEXP 07/11/2025\nISS 07/11/2015")).toEqual({
      documentNumber: "123456789",
      expiryDate: "2025-11-07",
      issueDate: "2015-11-07",
    });
  });

  it("doesn't take 'dl' in lower case as a licence label", () => {
    expect(read("handl 12345678")).toEqual({});
  });

  it("reads neither date under a label naming both issue and expiry", () => {
    // The Australian passport prints "Date of issue / Date d'expiration" over the issue date.
    expect(read("Date of issue / Date d'expiration\n18 MAR 2019\nAuthority\n18 MAR 2029")).toEqual({});
  });

  it("takes the one number-shaped token under a label that ends its line", () => {
    expect(read("PASSPORT AUSTRALIA DOCUMENT NO.\neT N0885237")).toEqual({ documentNumber: "N0885237" });
  });

  it("takes nothing when the line under the label has two candidates", () => {
    expect(read("Document number\n12345678 87654321")).toEqual({});
  });
});

describe("MRZ document number repair", () => {
  it("fixes one look-alike character when both check digits then agree", () => {
    const misread = PASSPORT_MRZ[1].replace("L898902C3", "L8989O2C3");
    expect(readMrz(`${PASSPORT_MRZ[0]}\n${misread}`)).toMatchObject({ documentNumber: "L898902C3" });
  });

  it("leaves the number blank when no single swap satisfies the check digits", () => {
    const misread = PASSPORT_MRZ[1].replace("L898902C3", "L898902G3");
    expect(readMrz(`${PASSPORT_MRZ[0]}\n${misread}`)).not.toHaveProperty("documentNumber");
  });
});

/**
 * The text tesseract.js actually produced from sample images the owner
 * tested with: published specimen documents, not anyone's real document.
 */
describe("real OCR output from specimen documents", () => {
  it("Australian passport specimen: '<' read as C, 0 read as D", () => {
    const mrzPass = "PCAUSCITIZENCCIANECCCCCCCCCCLCCLCLLLLLCCCC<\nRAD1234564AUS9105045F3208014<99999000T<<<<86";
    expect(suggestFields("AUSTRALIA\nPASSPORT\n04 MAY 1991\nCANBERRA\n01 AUG 2022", "en-AU", mrzPass)).toEqual({
      name: "Passport (Australia)",
      type: "Passport",
      documentNumber: "RA0123456",
      expiryDate: "2032-08-01",
      country: "Australia",
    });
  });

  it("Chilean ID specimen: Spanish column headers over their dates", () => {
    const text = "FECHA DE NACIMIENTO NUMERO DOCUMENTO 3\n: 07 FEB 1975 728628513 208 158s 5\n¢ rr FECHA DE EMISION FECHA DE VENCIMIENTO\n5 J 14 APR 1975 15 SEP 2027";
    expect(suggestFields(text, "en-AU")).toEqual({ expiryDate: "2027-09-15", issueDate: "1975-04-14" });
  });

  it("Australian passport specimen with an invalid MRZ: nothing from it, and no guessed dates", () => {
    const text = "PASSPORT AUSTRALIA DOCUMENT NC\n18 MAR 2019 A\nLY J 18 MAR 2029\nP<AUSANTHONY<<MARCUS<SETH<<<<<<<<<<<<<<<<<<<<<<<<<<\nNOB8B5237AUS75213M2760315<<1987885W0<<<<<<<<<<B4";
    expect(suggestFields(text, "en-AU")).toEqual({ name: "Passport", type: "Passport" });
  });
});
