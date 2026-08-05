"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthUserBar } from "@/components/auth/auth-user-bar";
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
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              Enterprise Project, Budget and Performance Control
            </div>
            <AuthUserBar user={user} />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
