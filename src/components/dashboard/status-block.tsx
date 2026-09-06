import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DatabaseHealth } from "@/lib/db/queries";
import {
  CRON_STATUS_BADGE_VARIANT,
  CRON_STATUS_LABEL_NL,
  type CronHealth,
} from "@/lib/weather/cron-health";

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
 * Weerstation-rij: toont de échte koppel-/cronstatus (zie
 * `src/lib/weather/cron-health.ts`, ook gebruikt op `/station`) in plaats
 * van de statische "Nog niet gekoppeld"-tekst uit Fase 1 — die klopte na
 * Fase 2 (echte Ecowitt-ingestie) niet meer.
 */
function stationRow(stationLinked: boolean, cronHealth: CronHealth | null): StatusRow {
  if (!stationLinked || !cronHealth) {
    return {
      label: "Weerstation",
      value: "Nog niet gekoppeld",
      variant: "default",
      icon: CircleDashed,
    };
  }

  return {
    label: "Weerstation",
    value: CRON_STATUS_LABEL_NL[cronHealth.status],
    variant: CRON_STATUS_BADGE_VARIANT[cronHealth.status],
    icon: CheckCircle2,
  };
}

/**
 * Statusblok voor de homepage: laat in één oogopslag zien of de applicatie
 * draait, of de database bereikbaar is, en of het weerstation daadwerkelijk
 * data aanlevert (zelfde cron-gezondheidsclassificatie als `/station`).
 */
export function StatusBlock({
  databaseHealth,
  stationLinked,
  cronHealth,
}: {
  databaseHealth: DatabaseHealth;
  stationLinked: boolean;
  cronHealth: CronHealth | null;
}) {
  const rows: StatusRow[] = [
    {
      label: "Applicatie",
      value: "Actief",
      variant: "success",
      icon: CheckCircle2,
    },
    databaseRow(databaseHealth),
    stationRow(stationLinked, cronHealth),
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
