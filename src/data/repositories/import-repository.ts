import type { SupabaseClient } from "@supabase/supabase-js";
import { money, sumMoney } from "@/lib/money";
import { DataAccessError } from "@/data/repositories/budget-repository";
import type { ImportRowInput } from "@/types/database";
import { createHash } from "crypto";
import { importPostBatch, importReviewBatch } from "@/lib/commands";

export interface ParsedImportRow extends ImportRowInput {
  rowNumber: number;
  errors: string[];
  warnings: string[];
}

export function parseImportRows(rows: ImportRowInput[]): ParsedImportRow[] {
  return rows.map((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!row.sourceTransactionId) errors.push("sourceTransactionId is required");
    if (!row.transactionDate) errors.push("transactionDate is required");
    if (!row.amountExVat || money(row.amountExVat).lte(0)) errors.push("amountExVat must be positive");
    if (!row.organizationUnitId || !row.costNodeId) {
      warnings.push("Missing dimension mapping — will enter unmapped queue");
    }
    return { ...row, rowNumber: index + 1, errors, warnings };
  });
}

export function calculateImportTotals(rows: ParsedImportRow[]) {
  const accepted = rows.filter((r) => r.errors.length === 0);
  const rejected = rows.filter((r) => r.errors.length > 0);
  return {
    rowCount: rows.length,
    acceptedRowCount: accepted.length,
    rejectedRowCount: rejected.length,
    fileTotal: sumMoney(rows.map((r) => r.amountExVat || "0")).toFixed(4),
    acceptedTotal: sumMoney(accepted.map((r) => r.amountExVat)).toFixed(4),
    rejectedTotal: sumMoney(rejected.map((r) => r.amountExVat || "0")).toFixed(4),
  };
}

export async function createImportBatch(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    importType: string;
    fileName: string;
    fileContent: string;
    rows: ParsedImportRow[];
    importedBy: string;
    fileHash?: string;
  },
) {
  const totals = calculateImportTotals(params.rows);
  const fileHash = params.fileHash ?? createHash("sha256").update(params.fileContent).digest("hex");

  const { data: existing } = await db
    .from("import_batches")
    .select("id")
    .eq("source_file_hash", fileHash)
    .eq("is_posted", true)
    .maybeSingle();
  if (existing) {
    throw new DataAccessError("Import batch already posted for this file hash.", "CONFLICT");
  }

  const { data: batch, error } = await db
    .from("import_batches")
    .insert({
      legal_entity_id: params.legalEntityId,
      import_type: params.importType,
      file_name: params.fileName,
      file_total: totals.fileTotal,
      imported_total: totals.acceptedTotal,
      row_count: totals.rowCount,
      accepted_row_count: totals.acceptedRowCount,
      rejected_row_count: totals.rejectedRowCount,
      accepted_total: totals.acceptedTotal,
      rejected_total: totals.rejectedTotal,
      source_file_hash: fileHash,
      imported_by: params.importedBy,
      approval_status: "submitted",
    })
    .select("*")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const sourceRows = params.rows.map((row) => ({
    import_batch_id: batch.id,
    row_number: row.rowNumber,
    raw_data: row,
    parse_status: row.errors.length > 0 ? "error" : row.warnings.length > 0 ? "warning" : "valid",
    error_message: row.errors.join("; ") || null,
  }));
  const { error: sourceError } = await db.from("imported_source_rows").insert(sourceRows);
  if (sourceError) throw new DataAccessError(sourceError.message, "DATABASE");

  return { batch, totals };
}

export async function reviewImportBatch(
  db: SupabaseClient,
  params: { batchId: string; idempotencyKey?: string },
) {
  return importReviewBatch(db, params.batchId, { idempotencyKey: params.idempotencyKey });
}

export async function postImportBatch(
  db: SupabaseClient,
  params: {
    batchId: string;
    legalEntityId: string;
    fiscalPeriodMap: Map<number, string>;
    approverId?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  const { data: batch, error: batchError } = await db
    .from("import_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();
  if (batchError || !batch) throw new DataAccessError("Import batch not found.", "NOT_FOUND");
  if (batch.legal_entity_id !== params.legalEntityId) {
    throw new DataAccessError("Import batch tenant mismatch.", "FORBIDDEN");
  }
  if (batch.is_posted) throw new DataAccessError("Import batch already posted.", "CONFLICT");

  if (batch.approval_status === "submitted") {
    await reviewImportBatch(db, { batchId: params.batchId, idempotencyKey: params.idempotencyKey });
  }

  const result = await importPostBatch(db, params.batchId, {
    idempotencyKey: params.idempotencyKey,
    correlationId: params.correlationId,
    expectedStatus: "under_review",
  });

  return {
    postedTotal: String(result.posted_total ?? "0"),
    duplicateCount: Number(result.duplicate_count ?? 0),
  };
}

export async function getUnmappedQueue(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("unmapped_transaction_queue")
    .select("*, import_batches!inner(legal_entity_id)")
    .eq("import_batches.legal_entity_id", legalEntityId)
    .eq("status", "open");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}
