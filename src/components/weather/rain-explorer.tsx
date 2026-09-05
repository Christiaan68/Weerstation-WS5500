"use client";

import { CloudRain, Droplets } from "lucide-react";
import { useEffect, useState } from "react";

import { RainBarChart } from "@/components/charts/rain-bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/weather/timezone";

type RainPeriod = "today" | "week" | "month" | "year";

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
  bars: Array<{ key: string; label: string; totalMm: number | null; isRainDay: boolean }>;
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

export function RainExplorer({ stationSlug }: { stationSlug: string }) {
  const [period, setPeriod] = useState<RainPeriod>("today");
  const [data, setData] = useState<RainOverviewResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const url = `/api/weather/rain?period=${period}&stationSlug=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(url, { cache: "no-store" });
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
  }, [stationSlug, period]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
        {(Object.keys(PERIOD_LABELS) as RainPeriod[]).map((p) => (
          <TabButton key={p} active={p === period} onClick={() => setPeriod(p)}>
            {PERIOD_LABELS[p]}
          </TabButton>
        ))}
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

      <Card>
        <CardHeader>
          <CardTitle>
            {period === "today"
              ? "Neerslag per uur"
              : period === "year"
                ? "Neerslag per maand"
                : "Neerslag per dag"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data ? (
            <RainBarChart bars={data.bars} />
          ) : (
            <div className="text-muted-foreground flex h-[260px] items-center justify-center text-sm">
              {loadFailed ? "Kon gegevens niet laden." : "Laden…"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
