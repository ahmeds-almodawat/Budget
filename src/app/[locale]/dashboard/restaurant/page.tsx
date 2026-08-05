import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function RestaurantDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.restaurant");
  const db = await createClient();

  const { data: scope } = await db
    .from("control_scopes")
    .select("id")
    .eq("code", "REST-BUD-2027")
    .single();

  const { data: branches } = await db
    .from("organization_units")
    .select("id, code, name_en, name_ar")
    .eq("legal_entity_id", LEGAL_ENTITY_MODAWAT)
    .like("code", "REST-%");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card>
        <CardContent className="p-4 text-sm text-slate-600">
          {locale === "ar"
            ? "لوحة المطاعم تعرض الفروع من قاعدة البيانات. استورد التكاليف الفعلية واربطها بفروع المطاعم لاحقاً لإظهار نسب تكلفة الطعام والعمالة."
            : "Restaurant dashboard lists branches from the database. Import and map actual costs to branches to populate food and labor cost percentages."}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {(branches ?? []).map((branch) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>{locale === "ar" ? branch.name_ar : branch.name_en}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-500">
              {scope
                ? locale === "ar"
                  ? "بانتظار استيراد الفعلي"
                  : "Awaiting actual import mapping"
                : locale === "ar"
                  ? "لا توجد ميزانية"
                  : "No budget scope"}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
