import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { detectFormulaLikeCell, parseSecureCsv } from "@/lib/import/secure-csv";
import { DEFAULT_UPLOAD_LIMITS } from "@/lib/import/upload-limits";

const REQUIRED = ["source_transaction_id", "transaction_date", "amount_ex_vat"];

function csvRow(values: string[]) {
  return values.map((v) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(",");
}

function makeCsv(headers: string[], rows: string[][]) {
  return [csvRow(headers), ...rows.map((r) => csvRow(r))].join("\n");
}

function parseBuffer(text: string, overrides = {}) {
  return parseSecureCsv(Buffer.from(text, "utf8"), { ...DEFAULT_UPLOAD_LIMITS, ...overrides }, {
    requiredHeaders: REQUIRED,
  });
}

describe("CSV import security matrix", () => {
  const validRow = ["TX-001", "2027-03-15", "1000.50"];

  it("rejects empty and zero-byte files", () => {
    expect(parseBuffer("").errors.length).toBeGreaterThan(0);
    expect(parseBuffer("", { maxBytes: 0 }).errors.length).toBeGreaterThan(0);
  });

  it("rejects oversize files", () => {
    const big = "x".repeat(DEFAULT_UPLOAD_LIMITS.maxBytes + 1);
    expect(parseBuffer(big).errors.some((e) => /size|bytes/i.test(e.message))).toBe(true);
  });

  it("accepts exactly maxBytes boundary when content fits row limits", () => {
    const header = makeCsv(REQUIRED, []);
    const pad = "a".repeat(Math.max(0, DEFAULT_UPLOAD_LIMITS.maxBytes - Buffer.byteLength(header, "utf8") - 1));
    const padded = `${header}\n${pad}`;
    if (Buffer.byteLength(padded, "utf8") <= DEFAULT_UPLOAD_LIMITS.maxBytes) {
      const result = parseBuffer(padded);
      expect(result.errors.filter((e) => /size|bytes/i.test(e.message))).toHaveLength(0);
    }
  });

  it("rejects invalid UTF-8 sequences", () => {
    const invalid = Buffer.from([0xff, 0xfe, 0xfd]);
    const result = parseSecureCsv(invalid, DEFAULT_UPLOAD_LIMITS, { requiredHeaders: REQUIRED });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects UTF-16 BOM content", () => {
    const utf16 = Buffer.from("\ufeffsource_transaction_id,transaction_date,amount_ex_vat\n", "utf16le");
    const result = parseSecureCsv(utf16, DEFAULT_UPLOAD_LIMITS, { requiredHeaders: REQUIRED });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects binary content renamed as CSV", () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x50, 0x4b, 0x03, 0x04]);
    const result = parseSecureCsv(binary, DEFAULT_UPLOAD_LIMITS, { requiredHeaders: REQUIRED });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects missing, duplicate, and unknown headers", () => {
    expect(parseBuffer(makeCsv(["source_transaction_id"], [validRow])).errors.length).toBeGreaterThan(0);
    expect(
      parseBuffer(makeCsv([...REQUIRED, "source_transaction_id", "extra"], [validRow])).errors.length,
    ).toBeGreaterThan(0);
    expect(parseBuffer(makeCsv([...REQUIRED, "unknown_col"], [validRow])).errors.length).toBeGreaterThan(0);
  });

  it("accepts reordered valid headers", () => {
    const result = parseBuffer(makeCsv(["amount_ex_vat", "transaction_date", "source_transaction_id"], [validRow]));
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it("rejects too many rows and columns", () => {
    const manyRows = makeCsv(REQUIRED, Array.from({ length: DEFAULT_UPLOAD_LIMITS.maxRows + 1 }, () => validRow));
    expect(parseBuffer(manyRows).errors.length).toBeGreaterThan(0);

    const wideHeaders = [...REQUIRED, ...Array.from({ length: DEFAULT_UPLOAD_LIMITS.maxColumns }, (_, i) => `c${i}`)];
    const wideRow = [...validRow, ...Array.from({ length: DEFAULT_UPLOAD_LIMITS.maxColumns }, () => "1")];
    expect(parseBuffer(makeCsv(wideHeaders, [wideRow])).errors.length).toBeGreaterThan(0);
  });

  it("rejects oversized cells and lines", () => {
    const longCell = "a".repeat(DEFAULT_UPLOAD_LIMITS.maxCellLength + 1);
    expect(parseBuffer(makeCsv(REQUIRED, [[longCell, "2027-03-15", "1"]])).errors.length).toBeGreaterThan(0);

    const longLine = `${validRow.join(",")},${"b".repeat(DEFAULT_UPLOAD_LIMITS.maxLineLength)}`;
    expect(parseBuffer(makeCsv(REQUIRED, [[longLine]])).errors.length).toBeGreaterThan(0);
  });

  it("accepts arbitrary text in data cells at parse stage (semantic validation is downstream)", () => {
    const result = parseBuffer(makeCsv(REQUIRED, [["TX", "not-a-date", "not-decimal"]]));
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it("detects formula-like cells with leading whitespace and control prefixes", () => {
    expect(detectFormulaLikeCell("=CMD('calc')")).toBe(true);
    expect(detectFormulaLikeCell("  =1+1")).toBe(true);
    expect(detectFormulaLikeCell("\t@SUM(A1)")).toBe(true);
    expect(detectFormulaLikeCell("\r=evil")).toBe(true);
    expect(detectFormulaLikeCell("-1250.50")).toBe(false);
    expect(detectFormulaLikeCell("-CMD()")).toBe(true);
  });

  it("warns on formula-like data values without evaluating", () => {
    const result = parseBuffer(makeCsv(REQUIRED, [["=1+1", "2027-03-15", "100"]]));
    expect(result.warnings.some((w) => w.code === "FORMULA_LIKE_CELL")).toBe(true);
  });

  it("computes stable SHA-256 hash of raw bytes", () => {
    const text = makeCsv(REQUIRED, [validRow]);
    const a = parseBuffer(text);
    const b = parseBuffer(text);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });

  it("rejects inconsistent row widths and malformed quoted CSV", () => {
    expect(parseBuffer(`${csvRow(REQUIRED)}\nTX-1,2027-03-15`).errors.some((e) => e.code === "INCONSISTENT_ROW_WIDTH")).toBe(true);
    expect(parseBuffer(`"unclosed,2027-03-15,1`).errors.length).toBeGreaterThan(0);
  });

  it("rejects embedded null bytes and control characters in cells", () => {
    const withNull = makeCsv(REQUIRED, [["TX\u0000X", "2027-03-15", "1"]]);
    expect(parseBuffer(withNull).errors.length).toBeGreaterThan(0);
  });

  it("caps retained validation errors", () => {
    const badRows = makeCsv(
      REQUIRED,
      Array.from({ length: DEFAULT_UPLOAD_LIMITS.maxErrors + 5 }, (_, i) => [`TX-${i}`, "bad-date", "x"]),
    );
    const result = parseBuffer(badRows);
    expect(result.errors.length).toBeLessThanOrEqual(DEFAULT_UPLOAD_LIMITS.maxErrors);
  });
});
