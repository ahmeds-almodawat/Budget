"use server";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createImportBatch,
  parseImportRows,
  postImportBatch,
  getUnmappedQueue,
} from "@/data/repositories/import-repository";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { LEGAL_ENTITY_MODAWAT, type ImportRowInput } from "@/types/database";
import { DataAccessError } from "@/data/repositories/budget-repository";

const FINANCE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
const APPROVER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";

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
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new DataAccessError("Import file is required.", "VALIDATION");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  let rows: ImportRowInput[] = [];

  if (fileName.endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, string>>(buffer.toString("utf8"), {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
      throw new DataAccessError(parsed.errors[0]?.message ?? "CSV parse error", "VALIDATION");
    }
    const headers = parsed.meta.fields ?? [];
    for (const required of REQUIRED_HEADERS) {
      if (!headers.includes(required)) {
        throw new DataAccessError(`Missing required header: ${required}`, "VALIDATION");
      }
    }
    rows = parsed.data.map(normalizeRow);
  } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    if (json.length > 0) {
      const headers = Object.keys(json[0]);
      for (const required of REQUIRED_HEADERS) {
        if (!headers.includes(required)) {
          throw new DataAccessError(`Missing required header: ${required}`, "VALIDATION");
        }
      }
    }
    rows = json.map(normalizeRow);
  } else {
    throw new DataAccessError("Supported formats: CSV and Excel.", "VALIDATION");
  }

  const parsedRows = parseImportRows(rows);
  const db = createAdminClient();
  const result = await createImportBatch(db, {
    legalEntityId: LEGAL_ENTITY_MODAWAT,
    importType: "actual_transactions",
    fileName,
    fileContent: buffer.toString("utf8"),
    rows: parsedRows,
    importedBy: FINANCE_ID,
  });

  return { batch: result.batch, totals: result.totals, rows: parsedRows };
}

export async function postImportBatchAction(batchId: string) {
  const db = createAdminClient();
  const periods = await getFiscalPeriods(db, "77777777-7777-7777-7777-777777777701");
  const fiscalPeriodMap = new Map(periods.map((p) => [p.period_number, p.id]));
  return postImportBatch(db, {
    batchId,
    legalEntityId: LEGAL_ENTITY_MODAWAT,
    fiscalPeriodMap,
    approverId: APPROVER_ID,
  });
}

export async function fetchUnmappedQueueAction() {
  const db = createAdminClient();
  return getUnmappedQueue(db, LEGAL_ENTITY_MODAWAT);
}

export async function getImportTemplateHeaders() {
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
      "Use ISO dates (YYYY-MM-DD). Amounts are SAR excluding VAT. Map organization_unit_id and cost_node_id to seeded UUIDs.",
    guidanceAr:
      "استخدم التاريخ بصيغة YYYY-MM-DD. المبالغ بالريال بدون ضريبة. اربط organization_unit_id و cost_node_id بالمعرفات في قاعدة البيانات.",
  };
}
