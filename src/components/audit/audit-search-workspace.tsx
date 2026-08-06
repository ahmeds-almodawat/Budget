"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuditEventsAction } from "@/app/actions/audit-actions";

interface AuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  created_at: string;
  profiles: { full_name_en: string | null; email: string } | null;
}

export function AuditSearchWorkspace({ initialEvents }: { initialEvents: AuditEvent[] }) {
  const locale = useLocale();
  const t = useTranslations("audit");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [events, setEvents] = useState(initialEvents);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      const result = await fetchAuditEventsAction({
        entityType: entityType || undefined,
        action: action || undefined,
      });
      setEvents(result ?? []);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="space-y-1 text-sm">
          <span>{t("entityType")}</span>
          <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t("action")}</span>
          <Input value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <div className="flex items-end">
          <Button onClick={search} disabled={pending}>
            {t("search")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="border-b py-2">
                <div className="flex justify-between">
                  <span>{e.action} · {e.entity_type}</span>
                  <span>{new Date(e.created_at).toLocaleString(locale)}</span>
                </div>
                <div className="text-muted-foreground">
                  {e.profiles?.full_name_en ?? e.profiles?.email ?? "—"} — {e.entity_id.slice(0, 8)}…
                </div>
                {e.reason && <div className="text-text-secondary">{e.reason}</div>}
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-muted-foreground">{t("noEvents")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
