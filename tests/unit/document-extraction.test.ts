import { describe, expect, it } from "vitest";
import { dateOrderFor, documentDateOrder, findDates, fullYear } from "@/lib/documents/extraction/dates";
import { readLabelledFields } from "@/lib/documents/extraction/labels";
import { looksLikeMrz, readMrz } from "@/lib/documents/extraction/mrz";
import { renewalTodo } from "@/lib/documents/extraction/renewal";
import { readFile, suggestFields } from "@/lib/documents/extraction/suggest";
import { imageDimensions, sniffFileKind } from "@/lib/documents/extraction/file-kind";

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

describe("two-digit years", () => {
  const now = new Date("2026-10-16T00:00:00Z");

  it("are this century unless that is more than 20 years ahead", () => {
    expect(fullYear(29, now)).toBe(2029);
    expect(fullYear(46, now)).toBe(2046);
    expect(fullYear(47, now)).toBe(1947);
    expect(fullYear(94, now)).toBe(1994);
  });
});

describe("printed numbers under a label", () => {
  const read = (text: string) => readLabelledFields(text, "DMY");

  it("ignores a stray character or two after the label", () => {
    expect(read("DOCUMENT No. x\nS0000001")).toEqual({ documentNumber: "S0000001" });
  });

  it("looks two lines down, past a line with no number on it", () => {
    expect(read("DOCUMENT No.\nType / Code of issuing State\nPASSPORT P AUS S0000001")).toEqual({ documentNumber: "S0000001" });
  });

  it("reads a leading '$' as the S OCR took it for", () => {
    expect(read("Document No.\n$0000001")).toEqual({ documentNumber: "S0000001" });
  });
});

describe("issue dates on the line below", () => {
  const read = (text: string) => readLabelledFields(text, "DMY");

  it("reads the line below 'Date of issue'", () => {
    expect(read("Date of issue\n01 NOV 2020")).toEqual({ issueDate: "2020-11-01" });
  });

  it("still needs the bare word 'issued' to have its date on its own line", () => {
    expect(read("Issued\n01 NOV 2020")).toEqual({});
  });
});

describe("printed number checked against an MRZ that couldn't settle its own", () => {
  // OCR of a 1994 Australian diplomatic passport specimen: the number's first 0 read as O,
  // the composite check digit lost, and line 1 longer than the layout from misread filler.
  const MRZ = "P<AUSCITIZEN<C<CJANECCCCCCLCLLLLLLLLLLLLLLLLLKL\nSO000001<9AUS9410316F9411014<<<<<<<<<<<<<<D";

  it("offers only candidates, since four one-character fixes satisfy the check digit", () => {
    expect(readMrz(MRZ)).toMatchObject({ expiryDate: "1994-11-01", country: "Australia" });
    expect(readMrz(MRZ)).not.toHaveProperty("documentNumber");
    expect(readMrz(MRZ).documentNumberCandidates).toContain("S0000001");
  });

  it("keeps the printed number when the MRZ vouches for it", () => {
    const text = "DIPLOMATIC AUSTRALIA DOCUMENT No. x\nType! 7 Code / 3\nPASSPORT  p  Sspys ewer $0000001";
    expect(suggestFields(text, "en-AU", MRZ)).toEqual({
      name: "Passport (Australia)",
      type: "Passport",
      documentNumber: "S0000001",
      expiryDate: "1994-11-01",
      country: "Australia",
    });
  });

  it("drops a printed number the MRZ contradicts", () => {
    expect(suggestFields("Document No.\nS0000007", "en-AU", MRZ)).not.toHaveProperty("documentNumber");
  });
});

describe("column headers over their dates", () => {
  const read = (text: string) => readLabelledFields(text, "DMY");

  it("tells the expiry from the date of birth beside it", () => {
    expect(read("LICENCE EXPIRY DATE OF BIRTH\n20-05-2019 29-07-1983")).toEqual({ expiryDate: "2019-05-20" });
    expect(read("DATE OF BIRTH LICENCE EXPIRY\n29-07-1983 20-05-2019")).toEqual({ expiryDate: "2019-05-20" });
  });

  it("reads nothing when the dates below don't match the headers one for one", () => {
    expect(read("LICENCE EXPIRY DATE OF BIRTH\n20-05-2019")).toEqual({});
  });
});

describe("several OCR readings of one page", () => {
  it("takes a field from whichever reading has it", () => {
    expect(suggestFields(["LICENCE NO.\n051395622", "Expiry 21/03/2024"], "en-AU")).toMatchObject({
      documentNumber: "051395622",
      expiryDate: "2024-03-21",
    });
  });

  it("leaves a field blank when the readings disagree", () => {
    expect(suggestFields(["Expiry 21/03/2024", "Expiry 21/08/2024"], "en-AU")).not.toHaveProperty("expiryDate");
  });
});

describe("real OCR output from Victorian driver licence specimens", () => {
  it("Jane Citizen: the flattened reading has the dates, the plain one a misread number with no label", () => {
    const plain = "VICTORIA AUSTRALIA\nJANE CITIZEN ~~ 887654301\n- FLAT 10 NaN 2\nEa";
    const flattened = "fe = mee —\nVICTORIA AUSTRALIA\nLICENCE NO.\nFLAT 10 on,\n77 SAMPLE PARADE j\nKEW EAST VIC 3102 ool\nLICENCE EXPIRY DATE OF BIRTH re\n20-05-2019 29-07-1983 | aad / )\nve LICENCE TYPE CONDITIONS MR Fe 'y\n= i CAR SBEAVXYZ [ag";
    expect(suggestFields([plain, flattened], "en-AU")).toEqual({ name: "License", type: "License", expiryDate: "2019-05-20" });
  });

  it("Zhang: the plain reading has a clean expiry where the flattened one read '-' as '7'", () => {
    const plain = "VICTORIA AUSTRALIA\n| ZHANG LICENCE NO.\nLIU 051395622\n2 MONTCLAIR CLOSE |\nSPRINGVALE SOUTH VIC 3172 / \\\nLICENCE EXPIRY DATE OF BIRTH \\\n21-03-2024 20-08-1995 -\nLICENCE TYPE CONDITIONS No\nCAR Va |";
    const flattened = "i VICTORIA AUSTRALIA AAA\nZHANG LICENCENO. |\n| LIU 051395622 |\nl  LicenCE EXPIRY DATE OF BIRTH i\n| 21703-2024 20-08-1995 | i\n\"LICENCE TYPE CONDITIONS A";
    expect(suggestFields([plain, flattened], "en-AU")).toEqual({
      name: "License",
      type: "License",
      documentNumber: "051395622",
      expiryDate: "2024-03-21",
    });
  });
});

describe("hostile input", () => {
  it("reads image dimensions from the header, before anything is decoded", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    png.set([0x00, 0x00, 0x4e, 0x20, 0x00, 0x00, 0x4e, 0x20], 16); // 20000 x 20000
    expect(imageDimensions(png, "png")).toEqual({ width: 20000, height: 20000 });

    // SOI, an APP0 segment to skip, then SOF0: precision 8, height 1080, width 1920.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03]);
    expect(imageDimensions(jpeg, "jpeg")).toEqual({ width: 1920, height: 1080 });
    expect(imageDimensions(new Uint8Array([0xff, 0xd8, 0x00]), "jpeg")).toBeNull();
  });

  it("keeps the rules fast on a page of nothing but labels", () => {
    const started = performance.now();
    suggestFields("Expiry ".repeat(30000), "en-AU");
    // Was 30 s when every label scanned the rest of its line.
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it("has no app route under /extraction, which the auth proxy skips for the OCR engine files", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const segments = (directory: string): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        return statSync(path).isDirectory() ? [entry, ...segments(path)] : [];
      });
    expect(segments("app").filter((segment) => segment.toLowerCase().startsWith("extraction"))).toEqual([]);
  });
});

describe("bills and notices (KD-057)", () => {
  it("reads a bill as a document and a to-do to pay it, and suggests both", () => {
    const bill = [
      "Electricity bill",
      "Account number: 1234 5678 90",
      "Bill date 15/10/2026",
      "Amount due $182.40",
      "Pay by 09/11/2026",
    ].join("\n");
    expect(readFile(bill, "en-AU")).toEqual({
      document: { name: "Electricity bill", type: "Bill", documentNumber: "1234 5678 90", issueDate: "2026-10-15" },
      details: [{ label: "Amount due", value: "$182.40", type: "TEXT" }],
      todo: { title: "Pay electricity bill", dueDate: "2026-11-09", notes: "Amount due: $182.40" },
      suggested: "BOTH",
    });
  });

  it("reads 'Bill date / Due date' printed as columns", () => {
    const bill = "Your water bill\nBill date        Due date\n15 Oct 2026      9 Nov 2026";
    expect(readFile(bill, "en-AU")).toMatchObject({
      document: { name: "Water bill", issueDate: "2026-10-15" },
      todo: { title: "Pay water bill", dueDate: "2026-11-09" },
    });
  });

  it("names a bill generically when it mentions more than one service", () => {
    expect(readFile("Electricity and gas account\nTax invoice\nDue date 30/11/2026", "en-AU")).toMatchObject({
      document: { name: "Bill" },
      todo: { title: "Pay bill", dueDate: "2026-11-30" },
    });
  });

  it("reads a renewal notice: the renew-by date is the to-do's, not the document's expiry", () => {
    const notice = "Vehicle registration renewal notice\nRegistration number ABC123\nRenew by 30/11/2026";
    expect(readFile(notice, "en-AU")).toEqual({
      document: { name: "Car registration renewal notice", type: "Notice", documentNumber: "ABC123" },
      todo: { title: "Renew car registration", dueDate: "2026-11-30" },
      suggested: "BOTH",
    });
  });

  it("drops a due date that is before the bill was issued", () => {
    expect(readFile("Gas bill\nBill date 15/10/2026\nDue date 01/10/2026", "en-AU")).toMatchObject({ suggested: "DOCUMENT" });
  });

  it("keeps identity documents as plain documents: no to-do, suggested Document", () => {
    expect(readFile("NSW Driver Licence\nLicence No. 12345678\nExpiry 03/04/2027", "en-AU")).toMatchObject({ suggested: "DOCUMENT" });
    expect(readFile("LICENCE EXPIRY DATE OF BIRTH\n20-05-2019 29-07-1983", "en-AU")).not.toHaveProperty("todo");
    const passport = `Passport\n${PASSPORT_MRZ.join("\n")}`;
    expect(readFile(passport, "en-AU")).toMatchObject({ suggested: "DOCUMENT", document: { type: "Passport" } });
  });
});

describe("bill payment details (KD-057)", () => {
  const today = "2026-10-20";
  const bpayBill = [
    "Coastal Energy",
    "Tax invoice",
    "Account name: Ishrat Jahan",
    "Account number 400 123 456",
    "Bill date 12/10/2026",
    "Total amount due $1,204.55",
    "Due date 06/11/2026",
    "BPAY  Biller code: 23796  Ref: 1234 5678 90",
  ].join("\n");

  it("reads the amount, account name, biller code and BPAY reference", () => {
    expect(readFile(bpayBill, "en-AU", undefined, today)).toEqual({
      document: { name: "Bill", type: "Bill", documentNumber: "400 123 456", issueDate: "2026-10-12" },
      details: [
        { label: "Amount due", value: "$1,204.55", type: "TEXT" },
        { label: "Account name", value: "Ishrat Jahan", type: "TEXT" },
        { label: "Biller code", value: "23796", type: "TEXT" },
        { label: "BPAY reference", value: "1234567890", type: "TEXT" },
      ],
      todo: {
        title: "Pay bill",
        dueDate: "2026-11-06",
        notes: "Amount due: $1,204.55\nAccount name: Ishrat Jahan\nBiller code: 23796\nBPAY reference: 1234567890",
      },
      suggested: "BOTH",
    });
  });

  it("reads 'Amount due   Due date' printed as columns", () => {
    const bill = "Water bill\nAmount due        Due date\n$96.10           14/11/2026";
    expect(readFile(bill, "en-AU", undefined, today)).toMatchObject({
      details: [{ label: "Amount due", value: "$96.10" }],
      todo: { dueDate: "2026-11-14", notes: "Amount due: $96.10" },
    });
  });

  it("uses a reference as the document number when nothing else numbers it and there's no BPAY", () => {
    expect(readFile("Insurance renewal\nReference number: POL-55821\nRenew by 01/12/2026", "en-AU", undefined, today)).toMatchObject({
      document: { documentNumber: "POL-55821" },
    });
    expect(readFile("Insurance renewal\nReference number: POL-55821\nRenew by 01/12/2026", "en-AU", undefined, today)).not.toHaveProperty("details");
  });

  it("keeps a BPAY reference out of the document number", () => {
    const reading = readFile("Council rates notice\nBiller code 1234\nCRN 9876543210\nDue date 30/11/2026", "en-AU", undefined, today);
    expect(reading.document).not.toHaveProperty("documentNumber");
    expect(reading.details).toEqual([
      { label: "Biller code", value: "1234", type: "TEXT" },
      { label: "BPAY reference", value: "9876543210", type: "TEXT" },
    ]);
  });

  it("doesn't read a date or a plain number as an amount", () => {
    expect(readLabelledFields("Amount due by 12.11.2026", "DMY")).not.toHaveProperty("amountDue");
    expect(readLabelledFields("Total due 3 instalments", "DMY")).not.toHaveProperty("amountDue");
    expect(readLabelledFields("Balance owing: $0.00.", "DMY")).toMatchObject({ amountDue: "$0.00" });
  });

  it("leaves an amount blank when two readings of it disagree", () => {
    expect(readLabelledFields("Amount due $182.40\nTotal due $128.40", "DMY")).not.toHaveProperty("amountDue");
  });

  it("stops an account name at the next label", () => {
    expect(readLabelledFields("Account name: J & A Smith Account number 12345", "DMY")).toMatchObject({ accountName: "J & A Smith", documentNumber: "12345" });
    expect(readLabelledFields("Customer name\nMs Priya O'Neil", "DMY")).toMatchObject({ accountName: "Ms Priya O'Neil" });
  });

  it("gives an identity document no bill details", () => {
    expect(readFile("Passport\nReference number 12345678", "en-AU", undefined, today)).not.toHaveProperty("details");
  });
});

describe("deadlines in the wording of a letter or email (KD-057)", () => {
  const today = "2026-10-20";

  it("finds 'please reply by 12 Nov' in a letter with no due-date label, and suggests a to-do", () => {
    const letter = "Strata Plan 1234\nDear owner,\nThe annual general meeting is coming up. Please reply by 12 Nov with your proxy form.\nRegards";
    expect(readFile(letter, "en-AU", undefined, today)).toMatchObject({
      document: { name: "Reply with your proxy form" },
      todo: { title: "Reply with your proxy form", dueDate: "2026-11-12" },
      suggested: "TODO",
    });
  });

  it("titles an emailed PDF from its subject and counts 'by tomorrow' from when it was sent", () => {
    const email = "From: Leasing <leasing@example.test>\nSent: Wednesday, 14 October 2026 4:02 PM\nSubject: Signed lease\n\nCould you return the signed lease by tomorrow?";
    expect(readFile(email, "en-AU", undefined, today)).toMatchObject({ todo: { title: "Signed lease", dueDate: "2026-10-15" } });
  });

  it("skips 'by next week' in a file that doesn't say when it was written", () => {
    expect(readFile("Notice to residents\nThe forms are due by next week.", "en-AU", undefined, today)).not.toHaveProperty("todo");
  });

  it("never turns an identity document's expiry into a to-do", () => {
    expect(readFile("NSW Driver Licence\nLicence No. 12345678\nExpires on 03/04/2027", "en-AU", undefined, today)).not.toHaveProperty("todo");
  });
});

describe("renewalTodo: a to-do for a document that didn't ask for one (KD-057)", () => {
  const today = "2026-10-20";

  it("is due on the expiry when that's still ahead", () => {
    expect(renewalTodo({ type: "Passport", expiryDate: "2030-05-01" }, today)).toEqual({ title: "Renew passport", dueDate: "2030-05-01" });
  });

  it("is due today, not years ago, when the document has already expired", () => {
    expect(renewalTodo({ type: "License", expiryDate: "2019-05-20" }, today)).toEqual({ title: "Renew license", dueDate: "2026-10-20" });
  });

  it("has no date when the document has no expiry", () => {
    expect(renewalTodo({ name: "Lease" }, today)).toEqual({ title: "Renew lease" });
  });
});
