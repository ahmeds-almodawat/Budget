"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface AdminProfileRow {
  id: string;
  email: string;
  full_name_en: string;
  full_name_ar: string;
  status: string;
}

export interface AdminRoleRow {
  id: string;
  user_id: string;
  role_code: string;
  scope_type: string;
  effective_start: string;
  effective_end: string | null;
}

export function AdministrationWorkspace({
  profiles,
  roles,
  legalEntityName,
}: {
  profiles: AdminProfileRow[];
  roles: AdminRoleRow[];
  legalEntityName: string;
}) {
  const t = useTranslations("administration");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("activeEntity")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-text-secondary">{legalEntityName}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("users")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b py-2">
                <span>{p.full_name_en} ({p.email})</span>
                <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("roleAssignments")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {roles.map((r) => (
              <li key={r.id} className="border-b py-2">
                {r.role_code} — {r.scope_type} ({r.effective_start}
                {r.effective_end ? ` → ${r.effective_end}` : ""})
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("localDiagnostics")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-text-secondary">{t("localDiagnosticsNote")}</CardContent>
      </Card>
    </div>
  );
}
