"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthUserBar } from "@/components/auth/auth-user-bar";
import { ActiveEntitySelector } from "@/components/layout/active-entity-selector";
import { usePathname } from "next/navigation";

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
  const isAuthRoute = pathname.includes("/auth/");

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <AppSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[var(--header)] px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75 sm:px-6 sm:py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="hidden min-w-0 sm:block">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Enterprise Control
              </p>
              <p className="truncate text-sm font-medium text-slate-700">
                Project · Budget · Performance
              </p>
            </div>
            <ActiveEntitySelector user={user} />
            <AuthUserBar user={user} />
          </div>
        </header>
        <main className="app-canvas flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
