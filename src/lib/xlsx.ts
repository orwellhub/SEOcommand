/**
 * Minimal, dependency-free .xlsx (OOXML SpreadsheetML) writer.
 *
 * Produces a genuine Excel workbook — not a CSV renamed to .xlsx — so the
 * keyword-research export opens natively in Excel / Numbers / Google Sheets
 * with numeric cells kept as numbers. Files are packed with the STORED (no
 * compression) ZIP method, which needs only a CRC-32 and keeps the writer tiny
 * and fully auditable; keyword exports are small, so size is a non-issue.
 *
 * Server-side only (returns raw bytes for an HTTP download).
 */

export interface XlsxColumn {
  header: string;
  key: string;
}

export type XlsxCell = string | number | null | undefined;

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, XlsxCell>>;
}

/* ------------------------------ CRC-32 --------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------- XML ----------------------------------- */

const encoder = new TextEncoder();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0-based column index → spreadsheet column name (0 → A, 26 → AA). */
function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Excel sheet names cannot exceed 31 chars or contain : \ / ? * [ ]. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/:?*[\]]/g, " ").trim() || "Sheet1";
  return cleaned.slice(0, 31);
}

function cellXml(ref: string, value: XlsxCell): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const headerCells = sheet.columns
    .map((col, c) => cellXml(`${columnName(c)}1`, col.header))
    .join("");
  const bodyRows = sheet.rows
    .map((row, r) => {
      const rowNumber = r + 2; // row 1 is the header
      const cells = sheet.columns
        .map((col, c) => cellXml(`${columnName(c)}${rowNumber}`, row[col.key]))
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData><row r="1">${headerCells}</row>${bodyRows}</sheetData></worksheet>`
  );
}

/* ------------------------------- ZIP ----------------------------------- */

interface ZipFile {
  name: string;
  data: Uint8Array;
}

function le16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function le32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function zipStored(files: ZipFile[]): Uint8Array {
  const chunks: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const local: number[] = [
      ...le32(0x04034b50),
      ...le16(20), // version needed
      ...le16(0), // flags
      ...le16(0), // method: stored
      ...le16(0), // mod time
      ...le16(0), // mod date
      ...le32(crc),
      ...le32(size), // compressed size
      ...le32(size), // uncompressed size
      ...le16(nameBytes.length),
      ...le16(0), // extra length
    ];
    chunks.push(...local, ...nameBytes, ...file.data);

    // Central directory record
    central.push(
      ...le32(0x02014b50),
      ...le16(20), // version made by
      ...le16(20), // version needed
      ...le16(0), // flags
      ...le16(0), // method
      ...le16(0), // mod time
      ...le16(0), // mod date
      ...le32(crc),
      ...le32(size),
      ...le32(size),
      ...le16(nameBytes.length),
      ...le16(0), // extra length
      ...le16(0), // comment length
      ...le16(0), // disk number start
      ...le16(0), // internal attributes
      ...le32(0), // external attributes
      ...le32(offset), // local header offset
    );
    central.push(...nameBytes);

    offset += local.length + nameBytes.length + size;
  }

  const centralOffset = offset;
  const centralSize = central.length;
  const eocd: number[] = [
    ...le32(0x06054b50),
    ...le16(0), // disk number
    ...le16(0), // disk with central directory
    ...le16(files.length),
    ...le16(files.length),
    ...le32(centralSize),
    ...le32(centralOffset),
    ...le16(0), // comment length
  ];

  return Uint8Array.from([...chunks, ...central, ...eocd]);
}

/* ------------------------------ public --------------------------------- */

/** Build a single-sheet .xlsx workbook and return its raw bytes. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  const safeSheet: XlsxSheet = { ...sheet, name: sanitizeSheetName(sheet.name) };
  const files: ZipFile[] = [
    {
      name: "[Content_Types].xml",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${escapeXml(safeSheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: encoder.encode(sheetXml(safeSheet)),
    },
  ];
  return zipStored(files);
}
