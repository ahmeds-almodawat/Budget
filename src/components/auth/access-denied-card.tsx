import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AccessDeniedCard({
  locale,
  title,
  message,
  returnHome,
  standalone = false,
}: {
  locale: string;
  title: string;
  message: string;
  returnHome: string;
  standalone?: boolean;
}) {
  return (
    <div
      className={standalone ? "auth-canvas flex min-h-screen items-center justify-center p-6" : "flex min-h-[60vh] items-center justify-center p-6"}
      data-testid="route-access-denied"
    >
      <Card className="w-full max-w-md border-border text-center shadow-[var(--shadow-card)]">
        <CardHeader className="items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-surface text-danger ring-1 ring-danger/30">
            <ShieldX className="h-7 w-7" aria-hidden />
          </div>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-text-secondary">{message}</p>
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/${locale}`}>{returnHome}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
