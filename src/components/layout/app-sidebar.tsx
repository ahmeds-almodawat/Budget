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
      { key: "purchaseOrders", href: "purchase-orders", icon: Receipt },
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

export function AppSidebar({
  user,
  onNavigate,
  testId = "app-sidebar",
}: {
  user: UserSummary | null;
  onNavigate?: () => void;
  testId?: string;
}) {
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
    <aside
      data-testid={testId}
      className="flex h-screen w-[17.5rem] shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div className="border-b border-sidebar-border p-4">
        <BrandMark locale={locale as "en" | "ar"} />
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-sidebar-muted">
          {pickLocalized(locale, productConfig.workingName.en, productConfig.workingName.ar)}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={tSidebar("mainNavigation")}>
        {navSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter((item) => shouldShow(item.key));
          if (visibleItems.length === 0) return null;

          return (
            <div key={sectionIndex} className={cn(sectionIndex > 0 && "mt-5")}>
              {section.labelKey ? (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">
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
                        onClick={onNavigate}
                        data-active={active ? "true" : "false"}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                          active
                            ? "bg-sidebar-active text-sidebar-active-foreground shadow-[var(--glow)]"
                            : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active ? "text-sidebar-accent" : "opacity-80 group-hover:opacity-100",
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

      <div className="border-t border-sidebar-border p-3">
        <Link
          href={pathname.replace(`/${locale}`, `/${altLocale}`)}
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
        >
          <Languages className="h-4 w-4 shrink-0" aria-hidden />
          <span>{altLocale === "ar" ? tSidebar("switchToArabic") : tSidebar("switchToEnglish")}</span>
        </Link>
        <p className="mt-2 flex items-center gap-2 px-3 text-[11px] text-sidebar-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          {tSidebar("systemOperational")}
        </p>
      </div>
    </aside>
  );
}
