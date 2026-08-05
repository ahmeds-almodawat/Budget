"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  LayoutDashboard,
  Wallet,
  FolderKanban,
  Flag,
  CheckSquare,
  PieChart,
  HandCoins,
  Receipt,
  TrendingUp,
  GitPullRequest,
  AlertTriangle,
  FileBarChart,
  Users,
  ClipboardCheck,
  Upload,
  Database,
  Settings,
  ScrollText,
  Home,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { productConfig } from "@/config/product";

const navItems = [
  { key: "home", href: "", icon: Home },
  { key: "executiveDashboard", href: "dashboard/executive", icon: LayoutDashboard },
  { key: "operationalBudgets", href: "budgets", icon: Wallet },
  { key: "projects", href: "projects", icon: FolderKanban },
  { key: "milestones", href: "milestones", icon: Flag },
  { key: "tasks", href: "tasks", icon: CheckSquare },
  { key: "costControl", href: "cost-control", icon: PieChart },
  { key: "commitments", href: "commitments", icon: HandCoins },
  { key: "actualCosts", href: "actuals", icon: Receipt },
  { key: "forecasts", href: "forecasts", icon: TrendingUp },
  { key: "changes", href: "changes", icon: GitPullRequest },
  { key: "risksIssues", href: "risks", icon: AlertTriangle },
  { key: "reports", href: "reports", icon: FileBarChart },
  { key: "employeePerformance", href: "performance", icon: Users },
  { key: "approvals", href: "approvals", icon: ClipboardCheck },
  { key: "imports", href: "imports", icon: Upload },
  { key: "masterData", href: "master-data", icon: Database },
  { key: "administration", href: "administration", icon: Settings },
  { key: "auditLog", href: "audit", icon: ScrollText },
] as const;

export function AppSidebar() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const productName =
    locale === "ar" ? productConfig.workingName.ar : productConfig.workingName.en;
  const otherLocale = locale === "ar" ? "en" : "ar";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-e border-slate-200 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 p-4">
        <div className="text-xs uppercase tracking-wide text-teal-400">
          {productConfig.shortName[locale as "en" | "ar"]}
        </div>
        <h1 className="mt-1 text-sm font-semibold leading-snug">{productName}</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Main navigation">
        <ul className="space-y-1">
          {navItems.map(({ key, href, icon: Icon }) => {
            const url = `/${locale}${href ? `/${href}` : ""}`;
            const active = pathname === url || (href && pathname.startsWith(`${url}/`));
            return (
              <li key={key}>
                <Link
                  href={url}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-teal-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{t(key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-slate-800 p-3">
        <Link
          href={pathname.replace(`/${locale}`, `/${otherLocale}`)}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Languages className="h-4 w-4" aria-hidden />
          <span>{otherLocale === "ar" ? "العربية" : "English"}</span>
        </Link>
      </div>
    </aside>
  );
}
