import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";

export default async function ProjectsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("project");
  const tPages = await getTranslations("pages.projects");

  const db = await createClient();
  const { data: scopes, error } = await db
    .from("control_scopes")
    .select("id, code, name_en, name_ar, scope_type_id, control_scope_types(scope_type)")
    .eq("legal_entity_id", LEGAL_ENTITY_MODAWAT)
    .order("code");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {error ? <p className="text-danger">{error.message}</p> : null}
      <div className="grid gap-4">
        {(scopes ?? []).map((scope) => {
          const type = (scope.control_scope_types as { scope_type?: string } | null)?.scope_type;
          return (
            <Card key={scope.id}>
              <CardHeader>
                <CardTitle>{pickLocalized(locale, scope.name_en, scope.name_ar)}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <span>{type}</span>
                {type === "project" ? (
                  <Link
                    href={`/${locale}/projects/${scope.id}`}
                    className="text-primary hover:underline"
                  >
                    {tPages("view")}
                  </Link>
                ) : type === "operational_budget" ? (
                  <Link href={`/${locale}/dashboard/hospital`} className="text-primary hover:underline">
                    {tPages("operationalDashboard")}
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
