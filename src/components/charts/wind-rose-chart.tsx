"use client";

import { computeNiceTicks } from "@/lib/weather/axis-scale";
import type { WindRose } from "@/lib/weather/wind";

const SIZE = 260;
const CENTER = SIZE / 2;
const MAX_RADIUS = 92;
const LABEL_RADIUS = 108;

/**
 * Zet een kompasgraad (0° = noord, met de klok mee) om naar een punt op een
 * cirkel met straal `r` rond het middelpunt. SVG's y-as wijst naar beneden,
 * wat handig samenvalt met de kloksgewijze richting van het kompas: bij 0°
 * (noord) geeft dit recht omhoog, bij 90° (oost) recht naar rechts, enz.
 */
function pointOnCircle(compassDeg: number, r: number): { x: number; y: number } {
  const rad = ((compassDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function wedgePath(startDeg: number, endDeg: number, r: number): string {
  if (r <= 0.5) return "";
  const start = pointOnCircle(startDeg, r);
  const end = pointOnCircle(endDeg, r);
  return `M ${CENTER} ${CENTER} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

/**
 * Interactieve windroos (16 Nederlandse kompasrichtingen) — Fase 3,
 * `/wind`-pagina. Fase 6: een VASTE, van tevoren berekende procentschaal
 * (0% tot een net afgeronde bovengrens boven de hoogste sectorwaarde) i.p.v.
 * altijd herschalen naar de sterkste windrichting van dit moment — anders
 * zou een rustige periode (bv. alle richtingen ~6%) er even "vol" uitzien
 * als een periode met een sterk overheersende richting (bv. 60% uit één
 * hoek), wat een oneerlijke/misleidende vergelijking tussen periodes zou
 * geven. De ringen zijn daarom gelabeld met hun percentage.
 */
export function WindRoseChart({ rose }: { rose: WindRose }) {
  const highestPercentage = Math.max(1, ...rose.sectors.map((s) => s.percentage));
  const scale = computeNiceTicks(0, highestPercentage, 4);
  const sectorWidth = 360 / rose.sectors.length;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        style={{ maxWidth: 320, aspectRatio: "1 / 1", height: "auto" }}
        role="img"
        aria-label={`Windroos: ${rose.sectors
          .filter((s) => s.count > 0)
          .map((s) => `${s.direction} ${s.percentage}%`)
          .join(", ")}${rose.calmCount > 0 ? `, windstil ${rose.calmCount}×` : ""}`}
      >
        {scale.ticks.map((tickPercentage) => (
          <circle
            key={tickPercentage}
            cx={CENTER}
            cy={CENTER}
            r={(tickPercentage / scale.max) * MAX_RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}
        {scale.ticks
          .filter((t) => t > 0)
          .map((tickPercentage) => (
            <text
              key={tickPercentage}
              x={CENTER + 3}
              y={CENTER - (tickPercentage / scale.max) * MAX_RADIUS - 2}
              fontSize={8}
              fill="var(--muted-foreground)"
            >
              {tickPercentage}%
            </text>
          ))}
        <line
          x1={CENTER}
          y1={CENTER - MAX_RADIUS}
          x2={CENTER}
          y2={CENTER + MAX_RADIUS}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <line
          x1={CENTER - MAX_RADIUS}
          y1={CENTER}
          x2={CENTER + MAX_RADIUS}
          y2={CENTER}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {rose.sectors.map((sector) => {
          const r = (sector.percentage / scale.max) * MAX_RADIUS;
          const start = sector.centerDeg - sectorWidth / 2 + 1;
          const end = sector.centerDeg + sectorWidth / 2 - 1;
          return (
            <path
              key={sector.direction}
              d={wedgePath(start, end, r)}
              fill="#0ea5e9"
              fillOpacity={0.75}
              stroke="#0284c7"
              strokeWidth={0.5}
            >
              <title>
                {sector.direction}: {sector.percentage}% ({sector.count}×)
                {sector.avgSpeedKmh !== null ? ` · gem. ${sector.avgSpeedKmh} km/h` : ""}
                {sector.maxGustKmh !== null
                  ? ` · max. stoot ${sector.maxGustKmh} km/h`
                  : ""}
              </title>
            </path>
          );
        })}

        {rose.sectors.map((sector) => {
          const { x, y } = pointOnCircle(sector.centerDeg, LABEL_RADIUS);
          const isCardinal = sector.centerDeg % 90 === 0;
          return (
            <text
              key={sector.direction}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isCardinal ? 12 : 9}
              fontWeight={isCardinal ? 600 : 400}
              fill="var(--muted-foreground)"
            >
              {sector.direction}
            </text>
          );
        })}
      </svg>

      <p className="text-muted-foreground text-xs">
        {rose.totalObservations} bruikbare metingen
        {rose.calmCount > 0 &&
          ` · windstil (< ${rose.calmThresholdKmh} km/h): ${rose.calmCount}×`}
      </p>
    </div>
  );
}
