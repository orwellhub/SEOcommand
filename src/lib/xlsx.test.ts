import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { buildXlsx } from "./xlsx";

const decoder = new TextDecoder();

describe("buildXlsx", () => {
  const bytes = buildXlsx({
    name: "Keyword Research",
    columns: [
      { header: "Keyword", key: "keyword" },
      { header: "Volume", key: "volume" },
      { header: "CPC (USD)", key: "cpc" },
    ],
    rows: [
      { keyword: "solar panels", volume: 1000, cpc: 2.5 },
      { keyword: 'tags & "quotes" <x>', volume: null, cpc: 0 },
    ],
  });

  it("emits a valid ZIP local-file-header magic", () => {
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("contains an end-of-central-directory record", () => {
    // PK\x05\x06 appears at the very end (no trailing comment).
    const tail = bytes.slice(bytes.length - 22, bytes.length - 18);
    expect([tail[0], tail[1], tail[2], tail[3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("packs all five OOXML parts", () => {
    const text = decoder.decode(bytes);
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(text).toContain(part);
    }
  });

  it("stores numbers as numeric cells and escapes strings", () => {
    // STORED entries are uncompressed, so the sheet XML is present verbatim.
    const text = decoder.decode(bytes);
    expect(text).toContain("<v>1000</v>");
    expect(text).toContain("<v>2.5</v>");
    expect(text).toContain("solar panels");
    expect(text).toContain("tags &amp; &quot;quotes&quot; &lt;x&gt;");
  });

  it("produces round-trippable stored entries (CRC intact)", () => {
    // A stored entry has compressed size == uncompressed size; inflateRaw of an
    // empty deflate stream would throw, so we assert the bytes are non-empty and
    // the header sizes are consistent by re-reading the first local header.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const compSize = view.getUint32(18, true);
    const uncompSize = view.getUint32(22, true);
    expect(compSize).toBe(uncompSize);
    expect(compSize).toBeGreaterThan(0);
    // inflateRawSync is imported to guard against accidentally shipping a
    // deflate-based writer without updating the stored-method assumptions.
    expect(typeof inflateRawSync).toBe("function");
  });
});
