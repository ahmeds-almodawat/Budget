import { createHash } from "crypto";
import type { UploadLimits } from "@/lib/import/upload-limits";

export interface CsvParseIssue {
  code: string;
  message: string;
  row?: number;
  column?: string;
}

export interface CsvParseStats {
  bytesProcessed: number;
  rowCount: number;
  columnCount: number;
  formulaLikeCells: number;
}

export interface SecureCsvParseResult {
  rows: Record<string, string>[];
  headers: string[];
  hash: string;
  stats: CsvParseStats;
  warnings: CsvParseIssue[];
  errors: CsvParseIssue[];
}

export interface SecureCsvParseOptions {
  requiredHeaders?: string[];
}

const NEGATIVE_NUMBER_PATTERN = /^-(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function detectFormulaLikeCell(value: string): boolean {
  if (!value) {
    return false;
  }

  const trimmed = value.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed) {
    return false;
  }

  const first = trimmed[0];
  if (first === "=" || first === "@" || first === "\t" || first === "\r" || first === "\n") {
    return true;
  }

  if (first === "+") {
    return true;
  }

  if (first === "-") {
    return !NEGATIVE_NUMBER_PATTERN.test(trimmed);
  }

  return false;
}

function pushIssue(
  bucket: CsvParseIssue[],
  limits: UploadLimits,
  issue: CsvParseIssue,
): boolean {
  if (bucket.length >= limits.maxErrors) {
    return false;
  }
  bucket.push(issue);
  return true;
}

function pushWarning(
  bucket: CsvParseIssue[],
  limits: UploadLimits,
  issue: CsvParseIssue,
): boolean {
  if (bucket.length >= limits.maxWarnings) {
    return false;
  }
  bucket.push(issue);
  return true;
}

function parseCsvRecord(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field.");
  }

  fields.push(current);
  return fields;
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      current += char;
      continue;
    }

    if (char === "\r") {
      if (next === "\n") {
        i += 1;
      }
      lines.push(current);
      current = "";
      continue;
    }

    if (char === "\n") {
      lines.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || text.endsWith("\n") || text.endsWith("\r")) {
    lines.push(current);
  }

  return lines;
}

function normalizeHeader(header: string, limits: UploadLimits, errors: CsvParseIssue[]): string | null {
  const trimmed = header.trim();
  if (!trimmed) {
    pushIssue(errors, limits, {
      code: "EMPTY_HEADER",
      message: "Header names cannot be empty.",
    });
    return null;
  }

  if (trimmed.length > limits.maxHeaderLength) {
    pushIssue(errors, limits, {
      code: "HEADER_TOO_LONG",
      message: `Header exceeds maximum length of ${limits.maxHeaderLength} characters.`,
      column: trimmed.slice(0, 32),
    });
    return null;
  }

  return trimmed;
}

export function parseSecureCsv(
  buffer: Buffer,
  limits: UploadLimits,
  options: SecureCsvParseOptions = {},
): SecureCsvParseResult {
  const errors: CsvParseIssue[] = [];
  const warnings: CsvParseIssue[] = [];
  const rows: Record<string, string>[] = [];
  const stats: CsvParseStats = {
    bytesProcessed: buffer.length,
    rowCount: 0,
    columnCount: 0,
    formulaLikeCells: 0,
  };

  const hash = computeSha256(buffer);

  if (buffer.length > limits.maxBytes) {
    pushIssue(errors, limits, {
      code: "FILE_TOO_LARGE",
      message: `Upload exceeds maximum size of ${limits.maxBytes} bytes.`,
    });
    return { rows, headers: [], hash, stats, warnings, errors };
  }

  const text = buffer.toString("utf8");
  const lines = splitCsvLines(text).filter((line, index, all) => {
    if (line.length === 0 && index === all.length - 1) {
      return false;
    }
    return true;
  });

  if (lines.length === 0) {
    pushIssue(errors, limits, {
      code: "EMPTY_FILE",
      message: "CSV file is empty.",
    });
    return { rows, headers: [], hash, stats, warnings, errors };
  }

  const headerLine = lines[0];
  if (headerLine.length > limits.maxLineLength) {
    pushIssue(errors, limits, {
      code: "LINE_TOO_LONG",
      message: `Header row exceeds maximum line length of ${limits.maxLineLength} characters.`,
      row: 1,
    });
    return { rows, headers: [], hash, stats, warnings, errors };
  }

  let headerFields: string[];
  try {
    headerFields = parseCsvRecord(headerLine);
  } catch {
    pushIssue(errors, limits, {
      code: "MALFORMED_HEADER",
      message: "Unable to parse CSV header row.",
      row: 1,
    });
    return { rows, headers: [], hash, stats, warnings, errors };
  }

  if (headerFields.length > limits.maxColumns) {
    pushIssue(errors, limits, {
      code: "TOO_MANY_COLUMNS",
      message: `CSV exceeds maximum column count of ${limits.maxColumns}.`,
      row: 1,
    });
    return { rows, headers: [], hash, stats, warnings, errors };
  }

  const headers: string[] = [];
  const seenHeaders = new Set<string>();

  for (const rawHeader of headerFields) {
    const header = normalizeHeader(rawHeader, limits, errors);
    if (!header) {
      continue;
    }

    const normalizedKey = header.toLowerCase();
    if (seenHeaders.has(normalizedKey)) {
      pushIssue(errors, limits, {
        code: "DUPLICATE_HEADER",
        message: `Duplicate header: ${header}`,
        row: 1,
        column: header,
      });
      continue;
    }

    seenHeaders.add(normalizedKey);
    headers.push(header);
  }

  stats.columnCount = headers.length;

  if (headers.length === 0) {
    return { rows, headers, hash, stats, warnings, errors };
  }

  for (const requiredHeader of options.requiredHeaders ?? []) {
    if (!headers.includes(requiredHeader)) {
      pushIssue(errors, limits, {
        code: "MISSING_REQUIRED_HEADER",
        message: `Missing required header: ${requiredHeader}`,
        row: 1,
        column: requiredHeader,
      });
    }
  }

  if (errors.length > 0) {
    return { rows, headers, hash, stats, warnings, errors };
  }

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.trim().length === 0) {
      continue;
    }

    if (rows.length >= limits.maxRows) {
      pushIssue(errors, limits, {
        code: "TOO_MANY_ROWS",
        message: `CSV exceeds maximum row count of ${limits.maxRows}.`,
        row: lineIndex + 1,
      });
      break;
    }

    if (line.length > limits.maxLineLength) {
      pushIssue(errors, limits, {
        code: "LINE_TOO_LONG",
        message: `Row exceeds maximum line length of ${limits.maxLineLength} characters.`,
        row: lineIndex + 1,
      });
      continue;
    }

    let fields: string[];
    try {
      fields = parseCsvRecord(line);
    } catch {
      pushIssue(errors, limits, {
        code: "MALFORMED_ROW",
        message: "Unable to parse CSV row.",
        row: lineIndex + 1,
      });
      continue;
    }

    if (fields.length > limits.maxColumns) {
      pushIssue(errors, limits, {
        code: "TOO_MANY_COLUMNS",
        message: `Row exceeds maximum column count of ${limits.maxColumns}.`,
        row: lineIndex + 1,
      });
      continue;
    }

    if (fields.length !== headers.length) {
      pushIssue(errors, limits, {
        code: "INCONSISTENT_ROW_WIDTH",
        message: `Row has ${fields.length} columns but ${headers.length} headers were expected.`,
        row: lineIndex + 1,
      });
      continue;
    }

    const row: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const header = headers[columnIndex];
      const rawValue = fields[columnIndex] ?? "";
      const value = rawValue.trim();

      if (value.includes("\0")) {
        pushIssue(errors, limits, {
          code: "INVALID_CELL",
          message: "Cell contains null bytes.",
          row: lineIndex + 1,
          column: header,
        });
        continue;
      }

      if (value.length > limits.maxCellLength) {
        pushIssue(errors, limits, {
          code: "CELL_TOO_LONG",
          message: `Cell exceeds maximum length of ${limits.maxCellLength} characters.`,
          row: lineIndex + 1,
          column: header,
        });
        continue;
      }

      if (detectFormulaLikeCell(value)) {
        stats.formulaLikeCells += 1;
        pushWarning(warnings, limits, {
          code: "FORMULA_LIKE_CELL",
          message: "Cell value looks like a spreadsheet formula and was flagged.",
          row: lineIndex + 1,
          column: header,
        });
      }

      row[header] = value;
    }

    rows.push(row);
    stats.rowCount = rows.length;
  }

  return { rows, headers, hash, stats, warnings, errors };
}
