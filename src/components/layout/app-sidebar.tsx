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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { productConfig } from "@/config/product";
import { BrandMark } from "@/components/layout/brand-mark";
import type { UserSummary } from "@/components/layout/app-shell";
import { hasPermission, type RoleAssignment, type RoleCode } from "@/domain/auth/permissions";
import { otherLocale, pickLocalized } from "@/lib/i18n/display";

type NavItem = { key: string; href: string; icon: LucideIcon };

const navSections: { labelKey?: string; items: NavItem[] }[] = [
  {
    items: [
      { key: "home", href: "", icon: Home },
      { key: "executiveDashboard", href: "dashboard/executive", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "sectionFinancial",
    items: [
      { key: "operationalBudgets", href: "budgets", icon: Wallet },
      { key: "costControl", href: "cost-control", icon: PieChart },
      { key: "commitments", href: "commitments", icon: HandCoins },
      { key: "actualCosts", href: "actuals", icon: Receipt },
      { key: "forecasts", href: "forecasts", icon: TrendingUp },
      { key: "imports", href: "imports", icon: Upload },
    ],
  },
  {
    labelKey: "sectionProjects",
    items: [
      { key: "projects", href: "projects", icon: FolderKanban },
      { key: "milestones", href: "milestones", icon: Flag },
      { key: "tasks", href: "tasks", icon: CheckSquare },
      { key: "changes", href: "changes", icon: GitPullRequest },
    ],
  },
  {
    labelKey: "sectionGovernance",
    items: [
      { key: "risksIssues", href: "risks", icon: AlertTriangle },
      { key: "approvals", href: "approvals", icon: ClipboardCheck },
      { key: "delegations", href: "delegations", icon: Users },
      { key: "requisitions", href: "requisitions", icon: HandCoins },
      { key: "periodClose", href: "period-close", icon: ScrollText },
      { key: "approvalRules", href: "approval-rules", icon: ClipboardCheck },
      { key: "auditLog", href: "audit", icon: ScrollText },
    ],
  },
  {
    labelKey: "sectionInsights",
    items: [
      { key: "employeePerformance", href: "performance", icon: Users },
      { key: "reports", href: "reports", icon: FileBarChart },
    ],
  },
  {
    labelKey: "sectionAdmin",
    items: [
      { key: "masterData", href: "master-data", icon: Database },
      { key: "administration", href: "administration", icon: Settings },
    ],
  },
];

export function AppSidebar({ user }: { user: UserSummary | null }) {
  const t = useTranslations("nav");
  const tSidebar = useTranslations("sidebar");
  const locale = useLocale();
  const pathname = usePathname();
  const altLocale = otherLocale(locale);

  const roleAssignments: RoleAssignment[] = (user?.roleCodes ?? []).map((roleCode) => ({
    roleCode: roleCode as RoleCode,
    scopeType: "legal_entity",
    scopeId: user?.primaryLegalEntityId ?? "",
  }));

  function canRead(resource: Parameters<typeof hasPermission>[1]) {
    if (!user) return false;
    return hasPermission(roleAssignments, resource, "read", user.primaryLegalEntityId ?? undefined);
  }

  function shouldShow(key: string) {
    if (key === "auditLog" && !canRead("audit")) return false;
    if (key === "imports" && !canRead("actual")) return false;
    return true;
  }

  return (
    <aside className="flex h-screen w-[17.5rem] shrink-0 flex-col border-e border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] shadow-xl shadow-slate-950/20">
      <div className="border-b border-[var(--sidebar-border)] p-4">
        <BrandMark locale={locale as "en" | "ar"} />
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {pickLocalized(locale, productConfig.workingName.en, productConfig.workingName.ar)}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        {navSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter((item) => shouldShow(item.key));
          if (visibleItems.length === 0) return null;

          return (
            <div key={sectionIndex} className={cn(sectionIndex > 0 && "mt-5")}>
              {section.labelKey ? (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t(section.labelKey as Parameters<typeof t>[0])}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {visibleItems.map(({ key, href, icon: Icon }) => {
                  const url = `/${locale}${href ? `/${href}` : ""}`;
                  const active = pathname === url || (href && pathname.startsWith(`${url}/`));
                  return (
                    <li key={key}>
                      <Link
                        href={url}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          active
                            ? "bg-gradient-to-r from-teal-600/90 to-teal-700/80 text-white shadow-md shadow-teal-950/30"
                            : "text-slate-300 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active ? "text-teal-100" : "text-slate-500 group-hover:text-teal-300",
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{t(key as Parameters<typeof t>[0])}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[var(--sidebar-border)] p-3">
        <Link
          href={pathname.replace(`/${locale}`, `/${altLocale}`)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Languages className="h-4 w-4 shrink-0" aria-hidden />
          <span>{altLocale === "ar" ? tSidebar("switchToArabic") : tSidebar("switchToEnglish")}</span>
        </Link>
      </div>
    </aside>
  );
}
