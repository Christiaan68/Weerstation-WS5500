"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_AXIS_COLOR, CHART_GRID_COLOR } from "@/components/charts/chart-colors";
import type { RainBar } from "@/lib/weather/rain-service";

/**
 * Staafgrafiek voor regen (per uur/dag/maand, afhankelijk van de gekozen
 * periode op `/regen` — zie `RainOverview.bars` uit `rain-service.ts`). Elke
 * staaf is al een correct INCREMENT (nooit een cumulatieve tellerstand), dus
 * hier wordt alleen getekend, niet opnieuw berekend.
 */
export function RainBarChart({
  bars,
  heightPx = 260,
}: {
  bars: RainBar[];
  heightPx?: number;
}) {
  const data = bars.map((bar) => ({ key: bar.key, label: bar.label, mm: bar.totalMm }));

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
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_GRID_COLOR}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke={CHART_AXIS_COLOR}
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID_COLOR }}
            minTickGap={20}
          />
          <YAxis
            stroke={CHART_AXIS_COLOR}
            tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
            tickLine={false}
            axisLine={false}
            width={36}
            unit=" mm"
          />
          <Tooltip
            formatter={(value) => [
              value === null || value === undefined ? "–" : `${value} mm`,
              "Neerslag",
            ]}
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--card-foreground)",
            }}
          />
          <Bar
            dataKey="mm"
            fill="#0ea5e9"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
