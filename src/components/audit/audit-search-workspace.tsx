"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
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
          <span>{locale === "ar" ? "نوع الكيان" : "Entity type"}</span>
          <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>{locale === "ar" ? "الإجراء" : "Action"}</span>
          <Input value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <div className="flex items-end">
          <Button onClick={search} disabled={pending}>
            {locale === "ar" ? "بحث" : "Search"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "سجل التدقيق" : "Audit log"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="border-b py-2">
                <div className="flex justify-between">
                  <span>{e.action} · {e.entity_type}</span>
                  <span>{new Date(e.created_at).toLocaleString(locale)}</span>
                </div>
                <div className="text-slate-500">
                  {e.profiles?.full_name_en ?? e.profiles?.email ?? "—"} — {e.entity_id.slice(0, 8)}…
                </div>
                {e.reason && <div className="text-slate-600">{e.reason}</div>}
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-slate-500">{locale === "ar" ? "لا توجد أحداث" : "No events found"}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
