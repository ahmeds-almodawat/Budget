import { setRequestLocale, getTranslations } from "next-intl/server";
import { ActualsWorkspace } from "@/components/financial/actuals-workspace";
import {
  fetchActualTransactionsAction,
  fetchDuplicateQueueAction,
  fetchImportBatchesAction,
  fetchUnmappedQueueAction,
} from "@/app/actions/financial-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ActualsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("actual", "read");
  const t = await getTranslations("pages.actuals");

  const [transactions, unmapped, batches, duplicates] = await Promise.all([
    fetchActualTransactionsAction(),
    fetchUnmappedQueueAction(),
    fetchImportBatchesAction(),
    fetchDuplicateQueueAction(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ActualsWorkspace
        transactions={transactions ?? []}
        unmapped={unmapped ?? []}
        batches={batches ?? []}
        duplicates={duplicates ?? []}
      />
    </div>
  );
}
