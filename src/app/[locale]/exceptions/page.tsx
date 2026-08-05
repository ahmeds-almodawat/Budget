import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchExceptionsAction } from "@/app/actions/audit-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { redirect } from "next/navigation";

export default async function ExceptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  if (!hasPermission(roleAssignments, "audit", "read", LEGAL_ENTITY_MODAWAT)) {
    redirect(`/${locale}/auth/access-denied`);
  }

  const exceptions = await fetchExceptionsAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {locale === "ar" ? "الاستثناءات والتنبيهات" : "Exceptions & alerts"}
        </h1>
        <Link href={`/${locale}/audit`} className="text-sm text-teal-700 hover:underline">
          {locale === "ar" ? "سجل التدقيق" : "Audit log"}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "تفسيرات الانحراف المعلقة" : "Pending variance explanations"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(exceptions?.varianceExplanations ?? []).map((v: { id: string; cause: string; variance_amount: string }) => (
              <li key={v.id} className="border-b py-2">{v.cause} — {v.variance_amount}</li>
            ))}
            {(exceptions?.varianceExplanations ?? []).length === 0 && (
              <li className="text-slate-500">{locale === "ar" ? "لا يوجد" : "None"}</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "معاملات غير مربوطة" : "Unmapped transactions"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(exceptions?.unmappedTransactions ?? []).map((u: { id: string; source_transaction_id: string; amount: string }) => (
              <li key={u.id} className="border-b py-2">{u.source_transaction_id} — {u.amount}</li>
            ))}
            {(exceptions?.unmappedTransactions ?? []).length === 0 && (
              <li className="text-slate-500">{locale === "ar" ? "لا يوجد" : "None"}</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "التنبيهات" : "Notifications"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(exceptions?.notifications ?? []).map((n: { id: string; title_en: string; title_ar: string; severity: string }) => (
              <li key={n.id} className="border-b py-2">
                {locale === "ar" ? n.title_ar : n.title_en} — {n.severity}
              </li>
            ))}
            {(exceptions?.notifications ?? []).length === 0 && (
              <li className="text-slate-500">{locale === "ar" ? "لا يوجد" : "None"}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
