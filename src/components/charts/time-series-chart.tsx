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
import type { AggregationInterval } from "@/lib/weather/downsampling";
import { computeAxisDomain, decimalsForStep } from "@/lib/weather/axis-scale";
import { getAxisScaleKind } from "@/lib/weather/history-metrics-catalog";
import { cn } from "@/lib/utils";
import { formatLocalDateShort, formatLocalTime } from "@/lib/weather/timezone";

export interface TimeSeriesPoint {
  t: string;
  values: Record<string, number | null>;
}

export interface TimeSeriesSeriesDef {
  key: string;
  label: string;
  unit: string;
}

interface TimeSeriesChartProps {
  points: TimeSeriesPoint[];
  series: TimeSeriesSeriesDef[];
  interval: AggregationInterval;
  /** Responsieve hoogte-variant — zie `chart-sizing.ts`. Standaard "default". */
  size?: ChartHeightVariant;
}

function tickFormatter(interval: AggregationInterval) {
  return (timestampMs: number) => {
    const date = new Date(timestampMs);
    if (interval === "raw" || interval === "5m") return formatLocalTime(date);
    if (interval === "hour") return formatLocalTime(date);
    return formatLocalDateShort(date);
  };
}

function tooltipLabelFormatter(interval: AggregationInterval) {
  return (timestampMs: number) => {
    const date = new Date(timestampMs);
    const time = interval === "day" ? "" : ` ${formatLocalTime(date)}`;
    return `${formatLocalDateShort(date)}${time}`;
  };
}

/** Voegt de eenheid compact toe aan een afgeronde schaalwaarde, bv. "18°C", "45%", "12 km/h". */
function formatTickWithUnit(value: number, step: number, unit: string): string {
  const number = value.toFixed(decimalsForStep(step));
  if (!unit) return number;
  if (unit === "°C" || unit === "%") return `${number}${unit}`;
  return `${number} ${unit}`;
}

/** Schat een passende Y-as-breedte op basis van de langste zichtbare schaalwaarde, zodat niets wordt afgekapt. */
function estimateAxisWidth(ticks: number[], step: number, unit: string): number {
  const longest = ticks.reduce((max, t) => {
    const label = formatTickWithUnit(t, step, unit);
    return Math.max(max, label.length);
  }, 0);
  return Math.min(76, Math.max(34, longest * 6.5 + 14));
}

/**
 * Groepeert series per eenheid — nooit twee eenheden op dezelfde Y-as (bv.
 * UV-index "" naast zoninstraling "W/m²"). Volgorde van eerste voorkomen
 * blijft behouden, zodat de bestaande volgorde/kleuren niet door elkaar
 * springen. Zie ook `axis-scale.ts` voor de schaalberekening zelf.
 */
function groupSeriesByUnit(series: TimeSeriesSeriesDef[]): TimeSeriesSeriesDef[][] {
  const order: string[] = [];
  const groups = new Map<string, TimeSeriesSeriesDef[]>();
  for (const s of series) {
    if (!groups.has(s.unit)) {
      groups.set(s.unit, []);
      order.push(s.unit);
    }
    groups.get(s.unit)!.push(s);
  }
  return order.map((unit) => groups.get(unit)!);
}

interface SingleAxisChartProps {
  data: Array<{ t: number } & Record<string, number | null>>;
  group: TimeSeriesSeriesDef[];
  colorOffset: number;
  interval: AggregationInterval;
  size: ChartHeightVariant;
  syncId: string;
}

/** Eén lijngrafiek voor precies één eenheid/Y-as — het daadwerkelijke recharts-element. */
function SingleAxisChart({ data, group, colorOffset, interval, size, syncId }: SingleAxisChartProps) {
  const domain = useMemo(() => {
    const values = data.flatMap((point) => group.map((s) => point[s.key] ?? null));
    // Bij meerdere reeksen op dezelfde as (bv. windsnelheid + windstoten) is de
    // schaalsoort voor allemaal gelijk (ze delen dezelfde eenheid), dus de
    // eerste reeks bepaalt de regels voor de hele as.
    const kind = getAxisScaleKind(group[0]!.key);
    return computeAxisDomain(values, kind, {
      targetTickCount: size === "compact" ? 4 : 5,
    });
  }, [data, group, size]);

  const unit = group[0]!.unit;

  return (
    <div className={cn("w-full", CHART_HEIGHT[size])}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} syncId={syncId}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickFormatter(interval)}
            stroke={CHART_AXIS_COLOR}
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID_COLOR }}
            minTickGap={40}
          />
          <YAxis
            type="number"
            domain={[domain.min, domain.max]}
            ticks={domain.ticks}
            tickFormatter={(value: number) => formatTickWithUnit(value, domain.step, unit)}
            stroke={CHART_AXIS_COLOR}
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
            tickLine={false}
            axisLine={false}
            width={estimateAxisWidth(domain.ticks, domain.step, unit)}
          />
          <Tooltip
            labelFormatter={(value) => tooltipLabelFormatter(interval)(value as number)}
            formatter={(value, name) => {
              const def = group.find((s) => s.key === name);
              return [
                value === null || value === undefined
                  ? "–"
                  : `${value} ${def?.unit ?? ""}`.trim(),
                def?.label ?? String(name),
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
          {group.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={chartColorFor(colorOffset + index)}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Generieke lijngrafiek voor tijdreeksdata uit `/api/weather/history` — één
 * of meerdere metrics tegelijk, uitgelijnd op dezelfde tijdas. `interval`
 * bepaalt de tijd-as-opmaak (uur/dag) — dezelfde waarde die de server via
 * `chooseAggregationInterval()` koos, dus de assen kloppen altijd met de
 * daadwerkelijk teruggegeven resolutie.
 *
 * De Y-as-schaal wordt per eenheid automatisch berekend uit de zichtbare,
 * geldige meetwaarden (zie `axis-scale.ts`) — nooit een vaste 0-100-schaal
 * tenzij de betekenis van de metric dat vereist. Bevat `series` meerdere
 * eenheden (bv. UV-index naast zoninstraling), dan wordt dat automatisch
 * opgesplitst in aparte, onder elkaar gestapelde mini-grafiekjes met elk hun
 * eigen as — twee eenheden worden nooit op één Y-as gecombineerd.
 */
export function TimeSeriesChart({
  points,
  series,
  interval,
  size = "default",
}: TimeSeriesChartProps) {
  const reactId = useId();
  const data = points.map((point) => ({
    t: new Date(point.t).getTime(),
    ...point.values,
  }));

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

  const groups = groupSeriesByUnit(series);

  if (groups.length <= 1) {
    return (
      <SingleAxisChart
        data={data}
        group={series}
        colorOffset={0}
        interval={interval}
        size={size}
        syncId={reactId}
      />
    );
  }

  // Meerdere eenheden binnen dezelfde aanroep: elke groep krijgt een eigen
  // as en een eigen bijschrift, iets compacter gestapeld — hetzelfde patroon
  // dat `HistoryChartCard` al gebruikte voor bv. luchtvochtigheid/luchtdruk.
  // Kleuroffsets vooraf berekend (i.p.v. tijdens het renderen bijgewerkt),
  // zodat elke groep toch doorlopend van kleur blijft verschillen.
  const colorOffsets: number[] = [];
  {
    let offset = 0;
    for (const group of groups) {
      colorOffsets.push(offset);
      offset += group.length;
    }
  }
  const subSize: ChartHeightVariant = size === "large" ? "default" : "compact";
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group, index) => {
        const label = group.map((s) => s.label).join(", ");
        return (
          <div key={group.map((s) => s.key).join(",")}>
            <p className="text-muted-foreground mb-2 text-xs font-medium">{label}</p>
            <SingleAxisChart
              data={data}
              group={group}
              colorOffset={colorOffsets[index]!}
              interval={interval}
              size={subSize}
              syncId={reactId}
            />
          </div>
        );
      })}
    </div>
  );
}
