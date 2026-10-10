"use client";

import { CloudRain, Droplets } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodNavigator } from "@/components/weather/period-navigator";
import { RainRangeChartCard } from "@/components/weather/rain-range-chart-card";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";
import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  formatLocalDateLong,
  formatLocalDateRangeShort,
  formatLocalDateTime,
  formatLocalMonthYear,
  formatLocalYear,
  getLocalDayBoundsUtc,
  getLocalMonthBoundsUtc,
  getLocalYearBoundsUtc,
  getLocalYearMonth,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

type RainPeriod = "today" | "week" | "month" | "year";

/**
 * Label bij de terug/vooruit-navigatie — puur client-side berekend uit
 * dezelfde gedeelde kalenderhulpfuncties als de server (`rain-service.ts`),
 * zodat het label direct (zonder op de fetch te wachten) klopt met wat de
 * API voor deze `period`+`offset` teruggeeft.
 */
function computeRainRangeLabel(period: RainPeriod, offset: number, timeZone?: string): string {
  const todayKey = todayLocalDateKey(timeZone);

  if (period === "today") {
    const dateKey = addDaysToDateKey(todayKey, -offset);
    return formatLocalDateLong(getLocalDayBoundsUtc(dateKey, timeZone).startUtc, timeZone);
  }

  if (period === "week") {
    const endKey = addDaysToDateKey(todayKey, -offset * 7);
    const startKey = addDaysToDateKey(endKey, -6);
    return formatLocalDateRangeShort(
      getLocalDayBoundsUtc(startKey, timeZone).startUtc,
      getLocalDayBoundsUtc(endKey, timeZone).endUtc,
      timeZone,
    );
  }

  const currentYearMonth = getLocalYearMonth(new Date(), timeZone);

  if (period === "month") {
    const { year, month } = addMonthsToYearMonth(
      currentYearMonth.year,
      currentYearMonth.month,
      -offset,
    );
    return formatLocalMonthYear(getLocalMonthBoundsUtc(year, month, timeZone).startUtc, timeZone);
  }

  // period === "year"
  const year = currentYearMonth.year - offset;
  return formatLocalYear(getLocalYearBoundsUtc(year, timeZone).startUtc, timeZone);
}

/**
 * Exact tijdvak (UTC) van `period`+`offset` voor de grafiek — dezelfde
 * vensters als `getRainOverview()` op de server (rain-service.ts): dag,
 * 7 dagen eindigend op (vandaag − offset·7), kalendermaand en kalenderjaar.
 */
function computeRainRange(
  period: RainPeriod,
  offset: number,
  timeZone?: string,
): { from: Date; to: Date } {
  const todayKey = todayLocalDateKey(timeZone);

  if (period === "today") {
    const dateKey = addDaysToDateKey(todayKey, -offset);
    const { startUtc, endUtc } = getLocalDayBoundsUtc(dateKey, timeZone);
    return { from: startUtc, to: endUtc };
  }

  if (period === "week") {
    const endKey = addDaysToDateKey(todayKey, -offset * 7);
    const startKey = addDaysToDateKey(endKey, -6);
    return {
      from: getLocalDayBoundsUtc(startKey, timeZone).startUtc,
      to: getLocalDayBoundsUtc(endKey, timeZone).endUtc,
    };
  }

  const currentYearMonth = getLocalYearMonth(new Date(), timeZone);

  if (period === "month") {
    const { year, month } = addMonthsToYearMonth(
      currentYearMonth.year,
      currentYearMonth.month,
      -offset,
    );
    const { startUtc, endUtc } = getLocalMonthBoundsUtc(year, month, timeZone);
    return { from: startUtc, to: endUtc };
  }

  const { startUtc, endUtc } = getLocalYearBoundsUtc(currentYearMonth.year - offset, timeZone);
  return { from: startUtc, to: endUtc };
}

const PERIOD_LABELS: Record<RainPeriod, string> = {
  today: "Vandaag",
  week: "Deze week",
  month: "Deze maand",
  year: "Dit jaar",
};

interface RainOverviewResponse {
  period: RainPeriod;
  totalMm: number | null;
  isRainDay: boolean;
  rainDayThresholdMm: number;
  maxRateMmH: { value: number; measuredAt: string } | null;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

const CHART_TITLES: Record<RainPeriod, string> = {
  today: "Neerslagverloop — vandaag",
  week: "Neerslagverloop — week",
  month: "Neerslagverloop — maand",
  year: "Neerslagverloop — jaar",
};

const CHART_DESCRIPTIONS: Record<RainPeriod, string> = {
  today: "Cumulatieve regen van de dag (linkeras) naast de regenintensiteit (rechteras).",
  week: "Regen opgeteld sinds het begin van de week (linkeras) naast de regenintensiteit (rechteras).",
  month: "Regen opgeteld sinds het begin van de maand (linkeras) naast de regenintensiteit (rechteras).",
  year: "Regen opgeteld sinds het begin van het jaar (linkeras) naast de hoogste regenintensiteit per dag (rechteras).",
};

export function RainExplorer({
  stationSlug,
  timeZone,
}: {
  stationSlug: string;
  timeZone?: string;
}) {
  const [period, setPeriod] = useState<RainPeriod>("today");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<RainOverviewResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const url = `/api/weather/rain?period=${period}&offset=${offset}&station=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(withBasePath(url), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as RainOverviewResponse;
        if (!cancelled) setData(json);
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
  }, [stationSlug, period, offset]);

  const rangeLabel = useMemo(
    () => computeRainRangeLabel(period, offset, timeZone),
    [period, offset, timeZone],
  );
  const getChartRange = useCallback(
    () => computeRainRange(period, offset, timeZone),
    [period, offset, timeZone],
  );

  function selectPeriod(p: RainPeriod) {
    setPeriod(p);
    setOffset(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
          {(Object.keys(PERIOD_LABELS) as RainPeriod[]).map((p) => (
            <TabButton key={p} active={p === period} onClick={() => selectPeriod(p)}>
              {PERIOD_LABELS[p]}
            </TabButton>
          ))}
        </div>

        <PeriodNavigator
          label={rangeLabel}
          onBack={() => setOffset((o) => o + 1)}
          onForward={() => setOffset((o) => Math.max(0, o - 1))}
          forwardDisabled={offset === 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Totale neerslag — {PERIOD_LABELS[period].toLowerCase()}</CardTitle>
            <CloudRain className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {data ? (
              data.totalMm === null ? (
                <p className="text-muted-foreground text-sm">
                  Nog geen gegevens ontvangen
                </p>
              ) : (
                <>
                  <p className="text-foreground text-2xl font-semibold tracking-tight">
                    {data.totalMm}
                    <span className="text-muted-foreground ml-1 text-base font-normal">
                      mm
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {data.isRainDay
                      ? `Regendag (≥ ${data.rainDayThresholdMm} mm)`
                      : `Geen regendag (< ${data.rainDayThresholdMm} mm)`}
                  </p>
                </>
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                {loadFailed ? "Kon gegevens niet laden." : "Laden…"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Hoogste regenintensiteit</CardTitle>
            <Droplets className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {data ? (
              data.maxRateMmH === null ? (
                <p className="text-muted-foreground text-sm">
                  Nog geen gegevens ontvangen
                </p>
              ) : (
                <>
                  <p className="text-foreground text-2xl font-semibold tracking-tight">
                    {data.maxRateMmH.value}
                    <span className="text-muted-foreground ml-1 text-base font-normal">
                      mm/u
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatLocalDateTime(new Date(data.maxRateMmH.measuredAt))}
                  </p>
                </>
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                {loadFailed ? "Kon gegevens niet laden." : "Laden…"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <RainRangeChartCard
        stationSlug={stationSlug}
        timeZone={timeZone}
        getRange={getChartRange}
        rangeKey={`${period}:${offset}:${timeZone ?? ""}`}
        autoRefresh={offset === 0}
        title={CHART_TITLES[period]}
        description={CHART_DESCRIPTIONS[period]}
        size="large"
      />
    </div>
  );
}
