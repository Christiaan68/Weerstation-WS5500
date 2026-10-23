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

interface RainPeriodTotals {
  last7DaysMm: number | null;
  monthMm: number | null;
  yearMm: number | null;
}

interface CurrentResponse {
  observation: RainObservation | null;
  rainPeriodTotals?: RainPeriodTotals | null;
}

interface RainFigure {
  /** Sleutel in de laatste meting van het station, of in de berekende periodetotalen. */
  key: keyof Omit<RainObservation, "measuredAt"> | keyof RainPeriodTotals;
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
  { key: "last7DaysMm", label: "Laatste 7 dagen", unit: "mm", hint: "Som van de dagtotalen" },
  { key: "monthMm", label: "Deze maand", unit: "mm", hint: "Som van de dagtotalen" },
  { key: "yearMm", label: "Dit jaar", unit: "mm", hint: "Som van de dagtotalen" },
  { key: "rainTotalMm", label: "Totaal sinds start", unit: "mm", hint: "Levenslange teller van het station" },
];

const NL_NUMBER = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function formatFigure(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "–";
  const value = Number(raw);
  return Number.isFinite(value) ? NL_NUMBER.format(value) : "–";
}

/**
 * Overzicht van alle regencijfers: de tellers die het station zelf bijhoudt
 * (intensiteit, uur, dag, bui, totaal) uit de laatste meting, plus de laatste
 * 7 dagen, deze maand en dit jaar als SOM VAN DE DAGTOTALEN
 * (`/api/weather/current`, veld `rainPeriodTotals`). De eigen week/maand/
 * jaar-tellers van het station worden bewust niet getoond: de jaarteller gaf
 * onmogelijke waarden (duizenden mm).
 */
export function RainTotalsPanel({
  stationSlug,
  timeZone,
}: {
  stationSlug: string;
  timeZone?: string;
}) {
  const [observation, setObservation] = useState<RainObservation | null | undefined>(undefined);
  const [periodTotals, setPeriodTotals] = useState<RainPeriodTotals | null>(null);
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
          setPeriodTotals(json.rainPeriodTotals ?? null);
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
                  {formatFigure(
                    figure.key === "last7DaysMm" ||
                      figure.key === "monthMm" ||
                      figure.key === "yearMm"
                      ? periodTotals?.[figure.key]
                      : observation[figure.key],
                  )}
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
