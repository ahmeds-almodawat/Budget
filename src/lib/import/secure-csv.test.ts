import { describe, it, expect } from "vitest";
import { DEFAULT_UPLOAD_LIMITS } from "@/lib/import/upload-limits";
import {
  computeSha256,
  detectFormulaLikeCell,
  parseSecureCsv,
} from "@/lib/import/secure-csv";

describe("detectFormulaLikeCell", () => {
  it("flags spreadsheet formula prefixes", () => {
    expect(detectFormulaLikeCell("=1+1")).toBe(true);
    expect(detectFormulaLikeCell("+cmd|'/c calc'!A0")).toBe(true);
    expect(detectFormulaLikeCell("@SUM(A1:A2)")).toBe(true);
    expect(detectFormulaLikeCell("\t=HYPERLINK(\"http://evil\")")).toBe(true);
  });

  it("allows negative numeric literals", () => {
    expect(detectFormulaLikeCell("-42")).toBe(false);
    expect(detectFormulaLikeCell("-123.45")).toBe(false);
    expect(detectFormulaLikeCell("  -0.75")).toBe(false);
  });

  it("flags ambiguous minus-prefixed expressions", () => {
    expect(detectFormulaLikeCell("-=1+1")).toBe(true);
    expect(detectFormulaLikeCell("-cmd")).toBe(true);
  });
});

describe("parseSecureCsv", () => {
  it("parses valid rows and computes a stable hash", () => {
    const csv = Buffer.from(
      "source_transaction_id,transaction_date,amount_ex_vat\n" +
        "TXN-1,2026-01-15,100.50\n" +
        "TXN-2,2026-01-16,200.00\n",
      "utf8",
    );

    const result = parseSecureCsv(csv, DEFAULT_UPLOAD_LIMITS, {
      requiredHeaders: ["source_transaction_id", "transaction_date", "amount_ex_vat"],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.headers).toEqual([
      "source_transaction_id",
      "transaction_date",
      "amount_ex_vat",
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.stats.rowCount).toBe(2);
    expect(result.hash).toBe(computeSha256(csv));
  });

  it("rejects duplicate headers", () => {
    const csv = Buffer.from("id,id,amount\n1,2,3\n", "utf8");
    const result = parseSecureCsv(csv, DEFAULT_UPLOAD_LIMITS);

    expect(result.errors.some((issue) => issue.code === "DUPLICATE_HEADER")).toBe(true);
    expect(result.rows).toHaveLength(0);
  });

  it("rejects missing required headers", () => {
    const csv = Buffer.from("source_transaction_id,amount_ex_vat\n1,2\n", "utf8");
    const result = parseSecureCsv(csv, DEFAULT_UPLOAD_LIMITS, {
      requiredHeaders: ["source_transaction_id", "transaction_date", "amount_ex_vat"],
    });

    expect(result.errors.some((issue) => issue.code === "MISSING_REQUIRED_HEADER")).toBe(true);
    expect(result.rows).toHaveLength(0);
  });

  it("enforces byte and row limits", () => {
    const oversized = Buffer.from("a".repeat(32), "utf8");
    const oversizedResult = parseSecureCsv(oversized, {
      ...DEFAULT_UPLOAD_LIMITS,
      maxBytes: 16,
    });
    expect(oversizedResult.errors.some((issue) => issue.code === "FILE_TOO_LARGE")).toBe(true);

    const csv = Buffer.from("h1,h2\n1,2\n3,4\n5,6\n", "utf8");
    const rowLimited = parseSecureCsv(csv, {
      ...DEFAULT_UPLOAD_LIMITS,
      maxRows: 1,
    });
    expect(rowLimited.errors.some((issue) => issue.code === "TOO_MANY_ROWS")).toBe(true);
    expect(rowLimited.rows).toHaveLength(1);
  });

  it("warns on formula-like cells without rejecting the row", () => {
    const csv = Buffer.from(
      "source_transaction_id,description\n" +
        "TXN-1,=HYPERLINK(\"http://example.test\")\n" +
        "TXN-2,normal text\n",
      "utf8",
    );

    const result = parseSecureCsv(csv, DEFAULT_UPLOAD_LIMITS);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.warnings.some((issue) => issue.code === "FORMULA_LIKE_CELL")).toBe(true);
    expect(result.stats.formulaLikeCells).toBe(1);
  });

  it("handles quoted fields with embedded commas and newlines", () => {
    const csv = Buffer.from(
      'id,description\n' +
        '1,"line one, still one cell"\n' +
        '2,"multi\nline"\n',
      "utf8",
    );

    const result = parseSecureCsv(csv, DEFAULT_UPLOAD_LIMITS);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].description).toBe("line one, still one cell");
    expect(result.rows[1].description).toBe("multi\nline");
  });

  it("rejects cells that exceed max length", () => {
    const csv = Buffer.from(`id,note\n1,${"x".repeat(DEFAULT_UPLOAD_LIMITS.maxCellLength + 1)}\n`, "utf8");
    const result = parseSecureCsv(csv, DEFAULT_UPLOAD_LIMITS);

    expect(result.errors.some((issue) => issue.code === "CELL_TOO_LONG")).toBe(true);
  });
});
