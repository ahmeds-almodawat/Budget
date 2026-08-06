import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUserSummary } from "@/app/actions/auth-actions";
import { fontArabic, fontLatin } from "@/lib/fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as AppLocale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const user = await getCurrentUserSummary();
  const fontClass = `${fontLatin.variable} ${fontArabic.variable}`;

  return (
    <html lang={locale} dir={dir} className={`h-full ${fontClass}`}>
      <body className="min-h-full font-sans antialiased text-slate-900">
        <NextIntlClientProvider messages={messages}>
          <AppShell user={user}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
