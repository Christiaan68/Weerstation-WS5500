"use client";

import { Droplets, Gauge, Thermometer, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodNavigator } from "@/components/weather/period-navigator";
import { cn } from "@/lib/utils";
import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  formatLocalDateLong,
  formatLocalDateTime,
  formatLocalMonthYear,
  formatLocalYear,
  getLocalDayBoundsUtc,
  getLocalMonthBoundsUtc,
  getLocalYearBoundsUtc,
  getLocalYearMonth,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

type RecordsPeriod = "today" | "month" | "year" | "all";

/**
 * Label bij de terug/vooruit-navigatie — client-side berekend uit dezelfde
 * gedeelde kalenderhulpfuncties als de server (`records.ts`), zodat het
 * label direct klopt zonder op de fetch te hoeven wachten. Niet aangeroepen
 * voor `period="all"` (geen navigatie mogelijk — zie render-logica onderaan).
 */
function computeRecordsRangeLabel(period: Exclude<RecordsPeriod, "all">, offset: number): string {
  const todayKey = todayLocalDateKey();

  if (period === "today") {
    const dateKey = addDaysToDateKey(todayKey, -offset);
    return formatLocalDateLong(getLocalDayBoundsUtc(dateKey).startUtc);
  }

  const currentYearMonth = getLocalYearMonth(new Date());

  if (period === "month") {
    const { year, month } = addMonthsToYearMonth(
      currentYearMonth.year,
      currentYearMonth.month,
      -offset,
    );
    return formatLocalMonthYear(getLocalMonthBoundsUtc(year, month).startUtc);
  }

  // period === "year"
  const year = currentYearMonth.year - offset;
  return formatLocalYear(getLocalYearBoundsUtc(year).startUtc);
}

const PERIOD_LABELS: Record<RecordsPeriod, string> = {
  today: "Vandaag",
  month: "Deze maand",
  year: "Dit jaar",
  all: "All-time",
};

interface RecordPoint {
  value: number;
  measuredAt: string;
}

interface RecordsResponse {
  period: RecordsPeriod;
  records: {
    temperatureMaxC: RecordPoint | null;
    temperatureMinC: RecordPoint | null;
    windGustMaxKmh: RecordPoint | null;
    windSpeedMaxKmh: RecordPoint | null;
    rainRateMaxMmH: RecordPoint | null;
    pressureMaxHpa: RecordPoint | null;
    pressureMinHpa: RecordPoint | null;
    humidityMaxPct: RecordPoint | null;
    humidityMinPct: RecordPoint | null;
  };
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

function RecordCard({
  icon: Icon,
  label,
  point,
  unit,
}: {
  icon: React.ElementType;
  label: string;
  point: RecordPoint | null;
  unit: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{label}</CardTitle>
        <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {point === null ? (
          <p className="text-muted-foreground text-sm">Nog geen gegevens</p>
        ) : (
          <>
            <p className="text-foreground text-2xl font-semibold tracking-tight">
              {point.value}
              <span className="text-muted-foreground ml-1 text-base font-normal">
                {unit}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatLocalDateTime(new Date(point.measuredAt))}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function RecordsExplorer({ stationSlug }: { stationSlug: string }) {
  const [period, setPeriod] = useState<RecordsPeriod>("today");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const url = `/api/weather/records?period=${period}&offset=${offset}&station=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as RecordsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [stationSlug, period, offset]);

  const rangeLabel = useMemo(
    () => (period === "all" ? null : computeRecordsRangeLabel(period, offset)),
    [period, offset],
  );

  function selectPeriod(p: RecordsPeriod) {
    setPeriod(p);
    setOffset(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
          {(Object.keys(PERIOD_LABELS) as RecordsPeriod[]).map((p) => (
            <TabButton key={p} active={p === period} onClick={() => selectPeriod(p)}>
              {PERIOD_LABELS[p]}
            </TabButton>
          ))}
        </div>

        {rangeLabel && (
          <PeriodNavigator
            label={rangeLabel}
            onBack={() => setOffset((o) => o + 1)}
            onForward={() => setOffset((o) => Math.max(0, o - 1))}
            forwardDisabled={offset === 0}
          />
        )}
      </div>

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RecordCard
            icon={Thermometer}
            label="Hoogste temperatuur"
            point={data.records.temperatureMaxC}
            unit="°C"
          />
          <RecordCard
            icon={Thermometer}
            label="Laagste temperatuur"
            point={data.records.temperatureMinC}
            unit="°C"
          />
          <RecordCard
            icon={Wind}
            label="Hoogste windstoot"
            point={data.records.windGustMaxKmh}
            unit="km/h"
          />
          <RecordCard
            icon={Wind}
            label="Hoogste windsnelheid"
            point={data.records.windSpeedMaxKmh}
            unit="km/h"
          />
          <RecordCard
            icon={Droplets}
            label="Hoogste regenintensiteit"
            point={data.records.rainRateMaxMmH}
            unit="mm/u"
          />
          <RecordCard
            icon={Gauge}
            label="Hoogste luchtdruk"
            point={data.records.pressureMaxHpa}
            unit="hPa"
          />
          <RecordCard
            icon={Gauge}
            label="Laagste luchtdruk"
            point={data.records.pressureMinHpa}
            unit="hPa"
          />
          <RecordCard
            icon={Droplets}
            label="Hoogste luchtvochtigheid"
            point={data.records.humidityMaxPct}
            unit="%"
          />
          <RecordCard
            icon={Droplets}
            label="Laagste luchtvochtigheid"
            point={data.records.humidityMinPct}
            unit="%"
          />
        </div>
      ) : (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {loadFailed ? "Kon records niet laden." : "Laden…"}
        </p>
      )}
    </div>
  );
}
