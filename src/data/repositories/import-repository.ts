import type { SupabaseClient } from "@supabase/supabase-js";
import { money, reconcileAllocations, sumMoney } from "@/lib/money";
import { DataAccessError } from "@/data/repositories/budget-repository";
import type { ImportRowInput } from "@/types/database";
import { createHash } from "crypto";

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
  },
) {
  const totals = calculateImportTotals(params.rows);
  const fileHash = createHash("sha256").update(params.fileContent).digest("hex");

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

export async function postImportBatch(
  db: SupabaseClient,
  params: {
    batchId: string;
    legalEntityId: string;
    fiscalPeriodMap: Map<number, string>;
    approverId?: string;
  },
) {
  const { data: batch, error: batchError } = await db
    .from("import_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();
  if (batchError || !batch) throw new DataAccessError("Import batch not found.", "NOT_FOUND");
  if (batch.is_posted) throw new DataAccessError("Import batch already posted.", "CONFLICT");

  const { data: sourceRows, error: sourceError } = await db
    .from("imported_source_rows")
    .select("*")
    .eq("import_batch_id", params.batchId)
    .order("row_number");
  if (sourceError) throw new DataAccessError(sourceError.message, "DATABASE");

  let postedTotal = money(0);
  const duplicateCandidates: { reason: string; sourceId: string }[] = [];

  for (const sourceRow of sourceRows ?? []) {
    if (sourceRow.parse_status === "error") continue;
    const row = sourceRow.raw_data as ImportRowInput & { warnings?: string[] };

    const { data: duplicate } = await db
      .from("actual_transactions")
      .select("id")
      .eq("legal_entity_id", params.legalEntityId)
      .eq("source_system", "CSV_IMPORT")
      .eq("source_transaction_id", row.sourceTransactionId)
      .maybeSingle();
    if (duplicate) {
      duplicateCandidates.push({
        reason: `Duplicate source transaction ${row.sourceTransactionId}`,
        sourceId: row.sourceTransactionId,
      });
      continue;
    }

    const periodId =
      row.fiscalPeriodNumber != null
        ? params.fiscalPeriodMap.get(row.fiscalPeriodNumber) ?? null
        : null;

    const exVat = money(row.amountExVat);
    const vat = money(row.vatAmount ?? "0");
    const incVat = exVat.plus(vat);

    const { data: txn, error: txnError } = await db
      .from("actual_transactions")
      .insert({
        legal_entity_id: params.legalEntityId,
        import_batch_id: params.batchId,
        source_system: "CSV_IMPORT",
        source_transaction_id: row.sourceTransactionId,
        journal_number: row.journalNumber ?? null,
        invoice_number: row.invoiceNumber ?? null,
        transaction_date: row.transactionDate,
        accounting_period_id: periodId,
        original_description: row.description ?? null,
        amount_ex_vat: exVat.toFixed(4),
        vat_amount: vat.toFixed(4),
        amount_inc_vat: incVat.toFixed(4),
        invoice_date: row.transactionDate,
      })
      .select("id")
      .single();
    if (txnError) throw new DataAccessError(txnError.message, "DATABASE");

    if (!row.organizationUnitId || !row.costNodeId) {
      await db.from("unmapped_transaction_queue").insert({
        import_batch_id: params.batchId,
        imported_source_row_id: sourceRow.id,
        actual_transaction_id: txn.id,
        reason: "Missing organization unit or cost item mapping",
      });
      postedTotal = postedTotal.plus(exVat);
      continue;
    }

    const reconciliation = reconcileAllocations(exVat.toFixed(4), [exVat.toFixed(4)]);
    if (!reconciliation.valid) {
      throw new DataAccessError("Allocation does not reconcile to source amount.", "VALIDATION");
    }

    const { error: allocError } = await db.from("actual_transaction_allocations").insert({
      actual_transaction_id: txn.id,
      organization_unit_id: row.organizationUnitId,
      cost_node_id: row.costNodeId,
      allocation_percent: 100,
      allocation_amount: exVat.toFixed(4),
    });
    if (allocError) throw new DataAccessError(allocError.message, "DATABASE");

    postedTotal = postedTotal.plus(exVat);
  }

  for (const dup of duplicateCandidates) {
    await db.from("duplicate_review_queue").insert({
      import_batch_id: params.batchId,
      match_reason: dup.reason,
      status: "pending",
    });
  }

  const { error: updateError } = await db
    .from("import_batches")
    .update({
      is_posted: true,
      posted_total: postedTotal.toFixed(4),
      approval_status: "posted",
      approved_by: params.approverId ?? null,
    })
    .eq("id", params.batchId);
  if (updateError) throw new DataAccessError(updateError.message, "DATABASE");

  return { postedTotal: postedTotal.toFixed(2), duplicateCount: duplicateCandidates.length };
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
