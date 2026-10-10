"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { withBasePath } from "@/lib/base-path";
import { formatLocalDateTime } from "@/lib/weather/timezone";

interface RainObservation {
  measuredAt: string;
  rainRateMmH: string | null;
  rainHourMm: string | null;
  rainDayMm: string | null;
  rainEventMm: string | null;
  rainWeekMm: string | null;
  rainMonthMm: string | null;
  rainYearMm: string | null;
  rainTotalMm: string | null;
}

interface CurrentResponse {
  observation: RainObservation | null;
}

interface RainFigure {
  key: keyof Omit<RainObservation, "measuredAt">;
  label: string;
  unit: string;
  hint: string;
}

/** Alle regenwaarden die het station meestuurt, in leesvolgorde (nu → lang geleden). */
const RAIN_FIGURES: RainFigure[] = [
  { key: "rainRateMmH", label: "Huidige intensiteit", unit: "mm/u", hint: "Hoe hard het nu regent" },
  { key: "rainHourMm", label: "Afgelopen uur", unit: "mm", hint: "Teller van het station" },
  { key: "rainDayMm", label: "Vandaag", unit: "mm", hint: "Telt op vanaf middernacht" },
  { key: "rainEventMm", label: "Huidige regenbui", unit: "mm", hint: "Telt tot het een tijd droog is" },
  { key: "rainWeekMm", label: "Deze week", unit: "mm", hint: "Teller van het station" },
  { key: "rainMonthMm", label: "Deze maand", unit: "mm", hint: "Teller van het station" },
  { key: "rainYearMm", label: "Dit jaar", unit: "mm", hint: "Teller van het station" },
  { key: "rainTotalMm", label: "Totaal sinds start", unit: "mm", hint: "Levenslange teller van het station" },
];

const NL_NUMBER = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function formatFigure(raw: string | null): string {
  if (raw === null) return "–";
  const value = Number(raw);
  return Number.isFinite(value) ? NL_NUMBER.format(value) : "–";
}

/**
 * Overzicht van alle regentellers die het station zelf bijhoudt (uur, dag,
 * bui, week, maand, jaar, totaal) plus de huidige intensiteit — uit dezelfde
 * laatste meting als het dashboard (`/api/weather/current`). Let op: week,
 * maand en jaar volgen de resetklok van het station; de periodetotalen in de
 * grafieken hieronder zijn berekend per kalenderperiode en kunnen daardoor
 * licht afwijken.
 */
export function RainTotalsPanel({
  stationSlug,
  timeZone,
}: {
  stationSlug: string;
  timeZone?: string;
}) {
  const [observation, setObservation] = useState<RainObservation | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `/api/weather/current?station=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(withBasePath(url), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as CurrentResponse;
        if (!cancelled) {
          setObservation(json.observation);
          setLoadFailed(false);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    const intervalId = setInterval(load, 300_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regen op dit moment</CardTitle>
        <CardDescription>
          {observation
            ? `Laatste meting: ${formatLocalDateTime(new Date(observation.measuredAt), timeZone)}`
            : "Alle regentellers van het station."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {observation === undefined ? (
          <p className="text-muted-foreground text-sm">
            {loadFailed ? "Kon gegevens niet laden." : "Laden…"}
          </p>
        ) : observation === null ? (
          <p className="text-muted-foreground text-sm">Nog geen gegevens ontvangen</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            {RAIN_FIGURES.map((figure) => (
              <div key={figure.key} title={figure.hint}>
                <dt className="text-muted-foreground text-xs font-medium">{figure.label}</dt>
                <dd className="text-foreground mt-0.5 text-xl font-semibold tracking-tight">
                  {formatFigure(observation[figure.key])}
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    {figure.unit}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
