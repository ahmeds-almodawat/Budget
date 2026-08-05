import { setRequestLocale } from "next-intl/server";
import { CommitmentsWorkspace } from "@/components/financial/commitments-workspace";
import { fetchCommitmentsAction, fetchVendorsAction } from "@/app/actions/financial-actions";

export default async function CommitmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [commitments, vendors] = await Promise.all([
    fetchCommitmentsAction(),
    fetchVendorsAction(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {locale === "ar" ? "الالتزامات" : "Commitments"}
      </h1>
      <CommitmentsWorkspace commitments={commitments ?? []} vendors={vendors ?? []} />
    </div>
  );
}
