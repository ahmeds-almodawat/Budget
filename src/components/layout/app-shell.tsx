"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthUserBar } from "@/components/auth/auth-user-bar";
import { ActiveEntitySelector } from "@/components/layout/active-entity-selector";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import type { RoleAssignment } from "@/domain/auth/permissions";

export interface UserSummary {
  userId: string;
  email: string;
  displayName: string;
  displayNameAr: string | null;
  roleCodes: string[];
  roleAssignments: RoleAssignment[];
  legalEntityIds: string[];
  primaryLegalEntityId: string | null;
  activeLegalEntityId: string | null;
  legalEntities: { id: string; code: string; name_en: string; name_ar: string }[];
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
    <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <div className="flex min-h-screen bg-background">
        <div className="hidden lg:block">
          <AppSidebar user={user} testId="app-sidebar" />
        </div>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 start-0 z-50 w-[17.5rem] max-w-[calc(100vw-3rem)] outline-none lg:hidden"
          >
            <Dialog.Title className="sr-only">{t("navigationTitle")}</Dialog.Title>
            <AppSidebar
              user={user}
              testId="app-sidebar-mobile"
              onNavigate={() => setMobileNavOpen(false)}
            />
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-2 top-2 h-11 w-11 bg-sidebar"
                aria-label={t("closeNavigation")}
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-header px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Dialog.Trigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 lg:hidden"
                    aria-label={t("openNavigation")}
                    data-testid="mobile-nav-toggle"
                  >
                    <Menu className="h-5 w-5" aria-hidden />
                  </Button>
                </Dialog.Trigger>
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
    </Dialog.Root>
  );
}
