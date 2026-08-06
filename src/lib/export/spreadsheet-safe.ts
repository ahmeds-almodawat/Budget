import ExcelJS from "exceljs";
import { detectFormulaLikeCell } from "@/lib/import/secure-csv";

const NEGATIVE_NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const INVALID_SHEET_CHARS = /[:\\/?*[\]]/g;

function stringifyCellValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function inferSourceType(value: unknown): "text" | "number" {
  if (typeof value === "number" && Number.isFinite(value)) {
    return "number";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && NEGATIVE_NUMBER_PATTERN.test(trimmed)) {
      return "number";
    }
  }

  return "text";
}

export function neutralizeCsvCell(value: unknown, sourceType: "text" | "number"): string {
  const str = stringifyCellValue(value);

  if (sourceType === "number") {
    return str;
  }

  if (detectFormulaLikeCell(str)) {
    return `'${str}`;
  }

  return str;
}

function quoteCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function rowsToSafeCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((header) => quoteCsvField(neutralizeCsvCell(header, "text"))).join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const sourceType = inferSourceType(value);
          return quoteCsvField(neutralizeCsvCell(value, sourceType));
        })
        .join(","),
    ),
  ];

  return lines.join("\n");
}

export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(INVALID_SHEET_CHARS, " ").trim();
  const truncated = cleaned.slice(0, 31);
  return truncated.length > 0 ? truncated : "Sheet1";
}

export async function buildSafeXlsxBuffer(
  rows: Record<string, unknown>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sanitizeSheetName(sheetName));

  if (rows.length === 0) {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const headers = Object.keys(rows[0]);
  const headerRow = worksheet.addRow(headers.map((header) => neutralizeCsvCell(header, "text")));
  headerRow.eachCell((cell) => {
    cell.numFmt = "@";
  });

  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header];
      const sourceType = inferSourceType(value);
      if (sourceType === "number") {
        const numeric = typeof value === "number" ? value : Number(String(value).trim());
        return Number.isFinite(numeric) ? numeric : neutralizeCsvCell(value, "text");
      }
      return neutralizeCsvCell(value, "text");
    });

    const excelRow = worksheet.addRow(values);
    excelRow.eachCell((cell, columnNumber) => {
      const header = headers[columnNumber - 1];
      const sourceType = inferSourceType(row[header]);
      if (sourceType === "text") {
        cell.numFmt = "@";
      }
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
