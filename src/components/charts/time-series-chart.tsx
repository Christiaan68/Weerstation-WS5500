"use client";

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
import type { AggregationInterval } from "@/lib/weather/downsampling";
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
  heightPx?: number;
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

/**
 * Generieke lijngrafiek voor tijdreeksdata uit `/api/weather/history` — één
 * of meerdere metrics tegelijk, uitgelijnd op dezelfde tijdas. `interval`
 * bepaalt de tijd-as-opmaak (uur/dag) — dezelfde waarde die de server via
 * `chooseAggregationInterval()` koos, dus de assen kloppen altijd met de
 * daadwerkelijk teruggegeven resolutie.
 */
export function TimeSeriesChart({
  points,
  series,
  interval,
  heightPx = 320,
}: TimeSeriesChartProps) {
  const data = points.map((point) => ({
    t: new Date(point.t).getTime(),
    ...point.values,
  }));

  if (data.length === 0) {
    return (
      <div
        className="text-muted-foreground flex items-center justify-center text-sm"
        style={{ height: heightPx }}
      >
        Geen gegevens beschikbaar voor deze periode.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: heightPx }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_GRID_COLOR}
            vertical={false}
          />
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
            stroke={CHART_AXIS_COLOR}
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            labelFormatter={(value) => tooltipLabelFormatter(interval)(value as number)}
            formatter={(value, name) => {
              const def = series.find((s) => s.key === name);
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
          {series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={chartColorFor(index)}
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
