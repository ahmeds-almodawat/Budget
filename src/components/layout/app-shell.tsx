"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthUserBar } from "@/components/auth/auth-user-bar";
import { ActiveEntitySelector } from "@/components/layout/active-entity-selector";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface UserSummary {
  userId: string;
  email: string;
  displayName: string;
  displayNameAr: string | null;
  roleCodes: string[];
  legalEntityIds: string[];
  primaryLegalEntityId: string | null;
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: UserSummary | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const isAuthRoute = pathname.includes("/auth/");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar user={user} testId="app-sidebar" />
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          mobileNavOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label={t("closeNavigation")}
          className={cn(
            "absolute inset-0 bg-[var(--overlay)] transition-opacity",
            mobileNavOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileNavOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 start-0 w-[17.5rem] transition-transform duration-200",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
          )}
        >
          <AppSidebar
            user={user}
            testId="app-sidebar-mobile"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-header px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={t("openNavigation")}
                data-testid="mobile-nav-toggle"
                onClick={() => setMobileNavOpen(true)}
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              <div className="hidden min-w-0 sm:block">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("eyebrow")}
                </p>
                <p className="truncate text-sm font-medium text-text-secondary">
                  {t("tagline")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <ActiveEntitySelector user={user} />
              <AuthUserBar user={user} />
            </div>
          </div>
        </header>
        <main className="app-canvas flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
