import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AccessDeniedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="auth-canvas flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-border text-center shadow-[var(--shadow-card)]">
        <CardHeader className="items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-surface text-danger ring-1 ring-danger/30">
            <ShieldX className="h-7 w-7" aria-hidden />
          </div>
          <CardTitle>{t("accessDeniedTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-text-secondary">{t("accessDeniedMessage")}</p>
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/${locale}`}>{t("returnHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
