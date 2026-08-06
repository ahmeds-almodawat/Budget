"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/layout/brand-mark";
import { Languages, Lock, Mail } from "lucide-react";

export function SignInForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? `/${locale}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    if (!supabase) {
      setError(t("notConfigured"));
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(t("invalidCredentials"));
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-slate-200/80 shadow-[var(--shadow-card)]">
      <CardHeader className="space-y-4 pb-2">
        <div className="lg:hidden">
          <BrandMark locale={locale as "en" | "ar"} compact />
        </div>
        <div>
          <CardTitle className="text-xl">{t("signIn")}</CardTitle>
          <p className="mt-1.5 text-sm text-slate-500 lg:hidden">{t("signInSubtitle")}</p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>{t("email")}</span>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ps-10"
                placeholder="name@company.local"
              />
            </div>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>{t("password")}</span>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ps-10"
              />
            </div>
          </label>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full shadow-md shadow-teal-900/10" disabled={loading} size="lg">
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </form>
        <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-sm">
          <Languages className="h-4 w-4 text-slate-400" aria-hidden />
          <Link
            href={`/${locale === "ar" ? "en" : "ar"}/auth/sign-in`}
            className="font-medium text-teal-700 transition-colors hover:text-teal-800"
          >
            {locale === "ar" ? "English" : "العربية"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
