"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  parseImportFileAction,
  postImportBatchAction,
  fetchUnmappedQueueAction,
  getImportTemplateHeaders,
} from "@/app/actions/import-actions";
import {
  ORG_UNIT_PHARMACY,
  COST_NODE_INJECTABLE,
} from "@/types/database";

export function ActualImportWorkflow() {
  const t = useTranslations("imports");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ accepted: number; rejected: number; total: string } | null>(null);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function downloadTemplate() {
    const template = await getImportTemplateHeaders();
    const csv = [template.headers.join(","), 
      `TXN-001,2027-03-15,12500.00,1875.00,JE-100,INV-100,Pharmacy injectables,${ORG_UNIT_PHARMACY},${COST_NODE_INJECTABLE},3`
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "actual-transactions-template.csv";
    a.click();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={downloadTemplate}>
            {t("downloadTemplate")}
          </Button>
          <input
            type="file"
            accept=".csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const formData = new FormData();
              formData.append("file", file);
              setError(null);
              startTransition(async () => {
                try {
                  const result = await parseImportFileAction(formData);
                  setBatchId(result.batch.id);
                  setPreview({
                    accepted: result.totals.acceptedRowCount,
                    rejected: result.totals.rejectedRowCount,
                    total: result.totals.fileTotal,
                  });
                  setMessage(t("fileValidated"));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Import failed");
                }
              });
            }}
          />
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardContent className="grid gap-2 p-4 text-sm md:grid-cols-3">
            <div>{t("fileTotal")}: {preview.total}</div>
            <div>{t("acceptedRows")}: {preview.accepted}</div>
            <div>{t("rejectedRows")}: {preview.rejected}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <Button
          disabled={pending || !batchId || (preview?.rejected ?? 0) > 0}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await postImportBatchAction(batchId!);
                setMessage(
                  t("postedSummary", {
                    amount: result.postedTotal,
                    duplicates: result.duplicateCount,
                  }),
                );
                const unmapped = await fetchUnmappedQueueAction();
                setUnmappedCount(unmapped.length);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Post failed");
              }
            })
          }
        >
          {t("postBatch")}
        </Button>
      </div>

      {unmappedCount > 0 ? (
        <p className="text-warning">
          {t("unmappedQueue", { count: unmappedCount })}
        </p>
      ) : null}
      {message ? <p className="text-success">{message}</p> : null}
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
