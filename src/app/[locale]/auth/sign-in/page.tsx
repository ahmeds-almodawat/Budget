import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { productConfig } from "@/config/product";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  const loc = locale as "en" | "ar";

  return (
    <div className="auth-canvas flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between border-e border-border bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <BrandMark locale={loc} />
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-sidebar-foreground xl:text-4xl">
            {productConfig.workingName[loc]}
          </h1>
          <p className="text-sm leading-relaxed text-sidebar-muted">{t("signInSubtitle")}</p>
        </div>
        <p className="text-xs text-sidebar-muted">{productConfig.company[loc]}</p>
      </div>
      <div className="relative flex flex-1 items-center justify-center bg-background p-6">
        <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
          <ThemeToggle />
        </div>
        <Suspense
          fallback={
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          }
        >
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
