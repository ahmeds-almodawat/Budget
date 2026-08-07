import { describe, it, expect } from "vitest";
import {
  buildSafeXlsxBuffer,
  neutralizeCsvCell,
  rowsToSafeCsv,
  sanitizeSheetName,
} from "@/lib/export/spreadsheet-safe";

describe("neutralizeCsvCell", () => {
  it("prefixes dangerous formula markers for text", () => {
    expect(neutralizeCsvCell("=1+1", "text")).toBe("'=1+1");
    expect(neutralizeCsvCell("+cmd|'/c calc'!A0", "text")).toBe("'+cmd|'/c calc'!A0");
    expect(neutralizeCsvCell("@SUM(A1)", "text")).toBe("'@SUM(A1)");
  });

  it("preserves negative numbers when typed as numbers", () => {
    expect(neutralizeCsvCell(-42, "number")).toBe("-42");
    expect(neutralizeCsvCell("-123.45", "number")).toBe("-123.45");
  });

  it("preserves Arabic text without modification", () => {
    const arabic = "وصف المعاملة المالية";
    expect(neutralizeCsvCell(arabic, "text")).toBe(arabic);
  });

  it("neutralizes Arabic text that begins with a formula marker", () => {
    const risky = "=وصف";
    expect(neutralizeCsvCell(risky, "text")).toBe("'=وصف");
  });
});

describe("rowsToSafeCsv", () => {
  it("neutralizes risky text while keeping numeric columns literal", () => {
    const csv = rowsToSafeCsv([
      {
        id: "TXN-1",
        amount: -1500.75,
        note: "=HYPERLINK(\"http://example.test\")",
      },
    ]);

    expect(csv).toContain('"TXN-1"');
    expect(csv).toContain("-1500.75");
    expect(csv).toContain(`"'=HYPERLINK(""http://example.test"")"`);
  });

  it("sanitizes headers in the output", () => {
    const csv = rowsToSafeCsv([{ "=risky_header": "value" }]);
    expect(csv.startsWith(`"'=risky_header"`)).toBe(true);
  });
});

describe("sanitizeSheetName", () => {
  it("removes invalid characters and truncates to 31 characters", () => {
    expect(sanitizeSheetName("Budget/Actual:2026*Report")).toBe("Budget Actual 2026 Report");
    expect(sanitizeSheetName("A".repeat(40)).length).toBe(31);
  });

  it("falls back to Sheet1 for empty names", () => {
    expect(sanitizeSheetName("::::")).toBe("Sheet1");
  });
});

describe("buildSafeXlsxBuffer", () => {
  it("creates an XLSX buffer with bilingual and numeric content", async () => {
    const buffer = await buildSafeXlsxBuffer(
      [
        {
          description: "وصف المشروع",
          amount: -2500.5,
          note: "=IMPORTXML(\"http://example.test\",\"//a\")",
        },
      ],
      "تقرير/الميزانية",
    );

    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
