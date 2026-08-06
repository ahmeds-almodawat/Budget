import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/layout/brand-mark";
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
      <div className="relative hidden w-1/2 flex-col justify-between p-10 text-white lg:flex xl:p-14">
        <BrandMark locale={loc} />
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            {productConfig.workingName[loc]}
          </h1>
          <p className="text-sm leading-relaxed text-teal-100/80">{t("signInSubtitle")}</p>
        </div>
        <p className="text-xs text-slate-400">{productConfig.company[loc]}</p>
        <div
          className="pointer-events-none absolute -end-24 top-1/4 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 start-1/4 h-48 w-48 rounded-full bg-emerald-300/10 blur-3xl"
          aria-hidden
        />
      </div>
      <div className="flex flex-1 items-center justify-center bg-slate-50/95 p-6 backdrop-blur-sm lg:bg-white/80">
        <Suspense
          fallback={
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          }
        >
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
