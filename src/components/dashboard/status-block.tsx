import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DatabaseHealth } from "@/lib/db/queries";

interface StatusRow {
  label: string;
  value: string;
  variant: BadgeVariant;
  icon: typeof CheckCircle2;
}

function databaseRow(health: DatabaseHealth): StatusRow {
  if (health.status === "ok") {
    return {
      label: "Database",
      value: `Verbonden (${health.latencyMs} ms)`,
      variant: "success",
      icon: CheckCircle2,
    };
  }

  return {
    label: "Database",
    value: "Niet bereikbaar",
    variant: "danger",
    icon: CircleAlert,
  };
}

/**
 * Statusblok voor de homepage: laat in één oogopslag zien of de applicatie
 * draait, of de database bereikbaar is, en dat het weerstation zelf in
 * Fase 1 nog niet gekoppeld is.
 */
export function StatusBlock({ databaseHealth }: { databaseHealth: DatabaseHealth }) {
  const rows: StatusRow[] = [
    {
      label: "Applicatie",
      value: "Actief",
      variant: "success",
      icon: CheckCircle2,
    },
    databaseRow(databaseHealth),
    {
      label: "Weerstation",
      value: "Nog niet gekoppeld",
      variant: "default",
      icon: CircleDashed,
    },
  ];

  return (
    <Card>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <row.icon
              className="text-muted-foreground h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-xs font-medium">
                {row.label}
              </span>
              <Badge variant={row.variant} className="mt-1 w-fit">
                {row.value}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
