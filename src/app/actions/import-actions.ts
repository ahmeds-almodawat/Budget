"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  createImportBatch,
  parseImportRows,
  postImportBatch,
  reviewImportBatch,
  getUnmappedQueue,
} from "@/data/repositories/import-repository";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { FISCAL_YEAR_2027, type ImportRowInput } from "@/types/database";
import { parseSecureCsv } from "@/lib/import/secure-csv";
import { DEFAULT_UPLOAD_LIMITS } from "@/lib/import/upload-limits";

const REQUIRED_HEADERS = [
  "source_transaction_id",
  "transaction_date",
  "amount_ex_vat",
];

function normalizeRow(raw: Record<string, string>): ImportRowInput {
  return {
    sourceTransactionId: raw.source_transaction_id?.trim() ?? "",
    journalNumber: raw.journal_number?.trim(),
    invoiceNumber: raw.invoice_number?.trim(),
    transactionDate: raw.transaction_date?.trim() ?? "",
    amountExVat: raw.amount_ex_vat?.trim() ?? "0",
    vatAmount: raw.vat_amount?.trim(),
    description: raw.description?.trim(),
    organizationUnitId: raw.organization_unit_id?.trim(),
    costNodeId: raw.cost_node_id?.trim(),
    fiscalPeriodNumber: raw.fiscal_period_number ? Number(raw.fiscal_period_number) : undefined,
  };
}

export async function parseImportFileAction(formData: FormData) {
  return withActivePermission("actual", "import", async ({ ctx, legalEntityId, db }) => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new DataAccessError("Import file is required.", "VALIDATION");
    }

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".xlsm")) {
      throw new DataAccessError(
        "Excel import is temporarily disabled for security hardening. Upload a UTF-8 CSV file.",
        "VALIDATION",
      );
    }
    if (!lowerName.endsWith(".csv")) {
      throw new DataAccessError("Only CSV uploads are supported.", "VALIDATION");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSecureCsv(buffer, DEFAULT_UPLOAD_LIMITS, { requiredHeaders: REQUIRED_HEADERS });
    if (parsed.errors.length > 0) {
      throw new DataAccessError(parsed.errors[0]?.message ?? "CSV validation failed.", "VALIDATION");
    }

    const rows = parsed.rows.map((row) => normalizeRow(row as Record<string, string>));
    const parsedRows = parseImportRows(rows);
    const result = await createImportBatch(db, {
      legalEntityId,
      importType: "actual_transactions",
      fileName: file.name,
      fileContent: buffer.toString("utf8"),
      fileHash: parsed.hash,
      rows: parsedRows,
      importedBy: ctx.userId,
    });

    return {
      batch: result.batch,
      totals: result.totals,
      rows: parsedRows,
      warnings: parsed.warnings,
      hash: parsed.hash,
    };
  });
}

export async function reviewImportBatchAction(batchId: string) {
  return withActivePermission("actual", "approve", async ({ db }) => reviewImportBatch(db, { batchId }));
}

export async function postImportBatchAction(batchId: string) {
  return withActivePermission("actual", "approve", async ({ ctx, legalEntityId, db }) => {
    const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
    const fiscalPeriodMap = new Map(periods.map((p) => [p.period_number, p.id]));
    return postImportBatch(db, {
      batchId,
      legalEntityId,
      fiscalPeriodMap,
      approverId: ctx.userId,
    });
  });
}

export async function fetchUnmappedQueueAction() {
  return withActivePermission("actual", "read", async ({ legalEntityId, db }) =>
    getUnmappedQueue(db, legalEntityId),
  );
}

export async function getImportTemplateHeaders() {
  const { getAuthContext } = await import("@/lib/auth/context");
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new DataAccessError("Authentication required.", "FORBIDDEN");
  }

  return {
    headers: [
      "source_transaction_id",
      "transaction_date",
      "amount_ex_vat",
      "vat_amount",
      "journal_number",
      "invoice_number",
      "description",
      "organization_unit_id",
      "cost_node_id",
      "fiscal_period_number",
    ],
    guidanceEn:
      "Upload UTF-8 CSV only. Use ISO dates (YYYY-MM-DD). Amounts are SAR excluding VAT.",
    guidanceAr:
      "حمّل ملف CSV بترميز UTF-8 فقط. استخدم التاريخ بصيغة YYYY-MM-DD. المبالغ بالريال بدون ضريبة.",
  };
}
