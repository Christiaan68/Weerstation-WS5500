import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | null;
  unit?: string;
  secondaryLine?: string | null;
  className?: string;
}

/**
 * Kaart voor één weermetriek op het dashboard. Toont "Nog geen gegevens
 * ontvangen" zolang er geen meting beschikbaar is — zie Fase 1-scope §28.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  secondaryLine,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{label}</CardTitle>
        <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <p className="text-muted-foreground text-sm">Nog geen gegevens ontvangen</p>
        ) : (
          <>
            <p className="text-foreground text-2xl font-semibold tracking-tight">
              {value}
              {unit && (
                <span className="text-muted-foreground ml-1 text-base font-normal">
                  {unit}
                </span>
              )}
            </p>
            {secondaryLine && (
              <p className="text-muted-foreground mt-1 text-xs">{secondaryLine}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
