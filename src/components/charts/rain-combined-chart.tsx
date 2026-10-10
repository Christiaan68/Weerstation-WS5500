"use client";

import { useId, useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  chartColorFor,
} from "@/components/charts/chart-colors";
import { CHART_HEIGHT, type ChartHeightVariant } from "@/components/charts/chart-sizing";
import type { TimeSeriesPoint } from "@/components/charts/time-series-chart";
import { cn } from "@/lib/utils";
import {
  computeZeroBasedAxisDomain,
  decimalsForStep,
  type AxisDomain,
} from "@/lib/weather/axis-scale";
import type { AggregationInterval } from "@/lib/weather/downsampling";
import { runningRainTotal } from "@/lib/weather/rain-cumulative";
import {
  formatLocalDateShort,
  formatLocalTime,
  getLocalDateKey,
} from "@/lib/weather/timezone";

/** Metric-sleutels die deze grafiek uit `/api/weather/history` verwacht. */
export const RAIN_CUMULATIVE_KEY = "rainDayMm";
export const RAIN_RATE_KEY = "rainRateMmH";
export const RAIN_CHART_METRICS = [RAIN_CUMULATIVE_KEY, RAIN_RATE_KEY] as const;

const CUMULATIVE_LABEL = "Cumulatief";
const RATE_LABEL = "Regenintensiteit";
const CUMULATIVE_COLOR = chartColorFor(0); // blauw
const RATE_COLOR = chartColorFor(1); // oranje

interface RainCombinedChartProps {
  points: TimeSeriesPoint[];
  interval: AggregationInterval;
  /** Responsieve hoogte-variant — zie `chart-sizing.ts`. Standaard "default". */
  size?: ChartHeightVariant;
  /** Tijdzone van het station — bepaalt de dagwisseling bij het optellen en de tijd-as. */
  timeZone?: string;
}

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Tijd-as: bij één dag alleen de tijd, bij meerdere dagen de datum (anders
 * zou een week- of maandgrafiek steeds "06:00, 12:00, ..." tonen zonder dag).
 */
function tickFormatter(interval: AggregationInterval, spanMs: number, timeZone?: string) {
  return (timestampMs: number) => {
    const date = new Date(timestampMs);
    if (interval === "day" || spanMs > TWO_DAYS_MS) return formatLocalDateShort(date, timeZone);
    return formatLocalTime(date, timeZone);
  };
}

function tooltipLabelFormatter(interval: AggregationInterval, timeZone?: string) {
  return (timestampMs: number) => {
    const date = new Date(timestampMs);
    const time = interval === "day" ? "" : ` ${formatLocalTime(date, timeZone)}`;
    return `${formatLocalDateShort(date, timeZone)}${time}`;
  };
}

/**
 * Doorlopend opgetelde regen voor de getoonde reeks (zie `rain-cumulative.ts`):
 * bij één dag gelijk aan de dagteller van het station, bij een week/maand/jaar
 * de regen sinds het begin van de periode. Ook gebruikt voor het
 * periodetotaal onder/naast de grafiek, zodat grafiek en cijfer overeenkomen.
 */
export function cumulativeRainFromPoints(
  points: TimeSeriesPoint[],
  timeZone?: string,
): Array<number | null> {
  return runningRainTotal(
    points.map((point) => ({
      t: new Date(point.t).getTime(),
      value: point.values[RAIN_CUMULATIVE_KEY] ?? null,
    })),
    (t) => getLocalDateKey(new Date(t), timeZone),
  );
}

function formatTick(value: number, step: number, unit: string): string {
  return `${value.toFixed(decimalsForStep(step))} ${unit}`;
}

function estimateAxisWidth(domain: AxisDomain, unit: string): number {
  const longest = domain.ticks.reduce(
    (max, t) => Math.max(max, formatTick(t, domain.step, unit).length),
    0,
  );
  return Math.min(84, Math.max(46, longest * 7.5 + 18));
}

/**
 * Gecombineerde regengrafiek: de CUMULATIEVE regen van de dag (mm, linkeras)
 * naast de regenintensiteit (mm/u, rechteras), beide als lijn op dezelfde
 * tijdas. Twee eenheden op één grafiek mag hier uitzonderlijk wel, omdat de
 * twee assen elk hun eigen kleur en eenheid dragen (dit is een bewuste
 * uitzondering op de regel in `TimeSeriesChart` dat verschillende eenheden
 * onder elkaar gestapeld worden). Beide assen beginnen bij 0, zodat de
 * verhouding tussen "veel gevallen" en "hard geregend" eerlijk blijft.
 *
 * Bij een periode van meerdere dagen (week/maand/jaar) loopt de cumulatieve
 * lijn door over de dagen heen: de regen sinds het begin van de periode.
 */
export function RainCombinedChart({
  points,
  interval,
  size = "default",
  timeZone,
}: RainCombinedChartProps) {
  const reactId = useId();

  const data = useMemo(() => {
    const cumulative = cumulativeRainFromPoints(points, timeZone);
    return points.map((point, index) => ({
      t: new Date(point.t).getTime(),
      [RAIN_CUMULATIVE_KEY]: cumulative[index] ?? null,
      [RAIN_RATE_KEY]: point.values[RAIN_RATE_KEY] ?? null,
    }));
  }, [points, timeZone]);

  const spanMs = data.length > 1 ? data[data.length - 1]!.t - data[0]!.t : 0;

  const targetTickCount = size === "compact" ? 4 : 5;
  const cumulativeDomain = useMemo(
    () =>
      computeZeroBasedAxisDomain(
        data.map((d) => d[RAIN_CUMULATIVE_KEY]),
        { minSpan: 1, targetTickCount },
      ),
    [data, targetTickCount],
  );
  const rateDomain = useMemo(
    () =>
      computeZeroBasedAxisDomain(
        data.map((d) => d[RAIN_RATE_KEY]),
        { minSpan: 2, targetTickCount },
      ),
    [data, targetTickCount],
  );

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex w-full items-center justify-center text-sm",
          CHART_HEIGHT[size],
        )}
      >
        Geen gegevens beschikbaar voor deze periode.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{ backgroundColor: CUMULATIVE_COLOR }}
            aria-hidden="true"
          />
          {CUMULATIVE_LABEL} (mm, linkeras)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{ backgroundColor: RATE_COLOR }}
            aria-hidden="true"
          />
          {RATE_LABEL} (mm/u, rechteras)
        </span>
      </div>

      <div className={cn("w-full", CHART_HEIGHT[size])}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            syncId={reactId}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickFormatter(interval, spanMs, timeZone)}
              stroke={CHART_AXIS_COLOR}
              tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID_COLOR }}
              minTickGap={40}
            />
            <YAxis
              yAxisId="cumulative"
              orientation="left"
              type="number"
              domain={[cumulativeDomain.min, cumulativeDomain.max]}
              ticks={cumulativeDomain.ticks}
              tickFormatter={(value: number) => formatTick(value, cumulativeDomain.step, "mm")}
              stroke={CUMULATIVE_COLOR}
              tick={{ fontSize: 11, fill: CUMULATIVE_COLOR }}
              tickLine={false}
              axisLine={false}
              width={estimateAxisWidth(cumulativeDomain, "mm")}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              type="number"
              domain={[rateDomain.min, rateDomain.max]}
              ticks={rateDomain.ticks}
              tickFormatter={(value: number) => formatTick(value, rateDomain.step, "mm/u")}
              stroke={RATE_COLOR}
              tick={{ fontSize: 11, fill: RATE_COLOR }}
              tickLine={false}
              axisLine={false}
              width={estimateAxisWidth(rateDomain, "mm/u")}
            />
            <Tooltip
              labelFormatter={(value) => tooltipLabelFormatter(interval, timeZone)(value as number)}
              formatter={(value, name) => {
                const isCumulative = name === RAIN_CUMULATIVE_KEY;
                const unit = isCumulative ? "mm" : "mm/u";
                return [
                  value === null || value === undefined ? "–" : `${value} ${unit}`,
                  isCumulative ? CUMULATIVE_LABEL : RATE_LABEL,
                ];
              }}
              contentStyle={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--card-foreground)",
              }}
            />
            <Line
              yAxisId="cumulative"
              type="monotone"
              dataKey={RAIN_CUMULATIVE_KEY}
              name={RAIN_CUMULATIVE_KEY}
              stroke={CUMULATIVE_COLOR}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey={RAIN_RATE_KEY}
              name={RAIN_RATE_KEY}
              stroke={RATE_COLOR}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
