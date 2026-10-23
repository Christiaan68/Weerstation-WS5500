import { useId } from "react";

import type { WeatherScene } from "@/lib/weather/condition";

/**
 * De atmosferische illustratielaag achter de dashboard-hero: per weer-scene
 * een set zachte, gelaagde SVG-vormen (zon/maan met gloed, wolken, regen,
 * sneeuw, mist, sterren) — bewust GEEN iconen, maar grote, deels afgesneden
 * vormen die opgaan in de achtergrond (zie `.weather-scene-art` in
 * `globals.css`). Kleuren komen uit de CSS-variabelen die elke
 * `.weather-scene-*`-class zet, zodat de palet-keuze op één plek blijft.
 *
 * Puur decoratief (`aria-hidden`), en bewust zonder eigen state — de
 * scene komt van buitenaf (`weather-hero.tsx`).
 */

const VIEW_W = 400;
const VIEW_H = 150;

function Horizon({ opacity = 0.3 }: { opacity?: number }) {
  return (
    <path
      d="M-20 128 Q 130 112 220 120 T 420 126 L 420 160 L -20 160 Z"
      fill="var(--scene-horizon)"
      opacity={opacity}
    />
  );
}

function SunDisc({
  cx,
  cy,
  r,
  glowId,
  animate = true,
}: {
  cx: number;
  cy: number;
  r: number;
  glowId: string;
  animate?: boolean;
}) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g
      className={animate ? "weather-anim-sun" : undefined}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      <circle cx={cx} cy={cy} r={r * 3.2} fill={`url(#${glowId})`} />
      <g opacity={0.3}>
        {rays.map((a) => {
          const rad = (a * Math.PI) / 180;
          const x1 = cx + r * 1.35 * Math.cos(rad);
          const y1 = cy + r * 1.35 * Math.sin(rad);
          const x2 = cx + r * 2.3 * Math.cos(rad);
          const y2 = cy + r * 2.3 * Math.sin(rad);
          return (
            <line
              key={a}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--scene-ray)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="var(--scene-sun)" opacity={0.95} />
      <circle cx={cx} cy={cy} r={r * 0.5} fill="var(--scene-sun-core)" />
    </g>
  );
}

function MoonDisc({ cx, cy, r, glowId }: { cx: number; cy: number; r: number; glowId: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 3} fill={`url(#${glowId})`} />
      <circle cx={cx} cy={cy} r={r} fill="var(--scene-moon)" opacity={0.95} />
      <circle cx={cx} cy={cy} r={r * 0.6} fill="var(--scene-moon-core)" opacity={0.85} />
      {/* Zachte "maansikkel"-schaduw — subtiel, geen volle cartoon-maan. */}
      <circle cx={cx + r * 0.42} cy={cy - r * 0.28} r={r * 0.82} fill="var(--scene-sky-1)" opacity={0.5} />
    </g>
  );
}

const STAR_POSITIONS: Array<[number, number, number, number]> = [
  [40, 30, 1.4, 0],
  [90, 70, 1, 1.1],
  [150, 24, 1.6, 2.3],
  [210, 60, 1, 0.6],
  [250, 20, 1.3, 1.8],
  [70, 110, 1, 2.6],
  [190, 100, 1.4, 0.3],
  [30, 150, 1, 1.6],
  [130, 140, 1.2, 2.1],
];

function Stars() {
  return (
    <g>
      {STAR_POSITIONS.map(([x, y, r, delay], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill="var(--scene-star)"
          opacity={0.6}
          className="weather-anim-twinkle"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </g>
  );
}

function CloudBlob({
  cx,
  cy,
  scale = 1,
  fill,
  opacity = 0.6,
  filterId,
  className,
}: {
  cx: number;
  cy: number;
  scale?: number;
  fill: string;
  opacity?: number;
  filterId: string;
  className?: string;
}) {
  // Twee geneste groepen, bewust NIET één: de buitenste draagt de
  // positionerende SVG-`transform`-ATTRIBUUT (translate/scale). Een
  // CSS-animatie die zelf de `transform`-EIGENSCHAP zet (zoals de trage
  // "drift"-animaties hieronder) vervangt die attribuut-transform anders
  // volledig i.p.v. ermee te combineren — dan springt de wolk naar de
  // oorsprong. Door de animatie-klasse op een binnenste, ongepositioneerde
  // groep te zetten, blijft de plaatsing intact én werkt de subtiele drift.
  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${scale})`}
      opacity={opacity}
      filter={`url(#${filterId})`}
    >
      <g className={className}>
        <ellipse cx={-32} cy={8} rx={34} ry={18} fill={fill} />
        <ellipse cx={2} cy={-8} rx={44} ry={26} fill={fill} />
        <ellipse cx={38} cy={10} rx={30} ry={17} fill={fill} />
        <ellipse cx={6} cy={16} rx={50} ry={15} fill={fill} />
      </g>
    </g>
  );
}

function RainStreaks({
  originX,
  count,
  opacity,
}: {
  originX: number;
  count: number;
  opacity: number;
}) {
  const lines = Array.from({ length: count }, (_, i) => {
    const x = originX + i * (300 / count) - 150;
    const row = i % 3;
    return { x, y: 58 + row * 16, delay: (i % 5) * 0.08 };
  });
  return (
    <g className="weather-anim-rain" opacity={opacity}>
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x}
          y1={line.y}
          x2={line.x - 12}
          y2={line.y + 26}
          stroke="var(--scene-rain)"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.45 + (i % 3) * 0.15}
          style={{ animationDelay: `${line.delay}s` }}
        />
      ))}
    </g>
  );
}

const SNOWFLAKE_POSITIONS: Array<[number, number, number, number]> = [
  [30, 40, 2.2, 0],
  [70, 90, 1.6, 1.4],
  [110, 30, 2, 2.6],
  [150, 110, 1.4, 0.8],
  [190, 60, 2.4, 3.2],
  [230, 130, 1.6, 1.9],
  [270, 45, 2, 0.4],
  [310, 100, 1.8, 2.2],
  [350, 70, 2.2, 3.6],
  [10, 130, 1.4, 1.1],
  [130, 144, 1.8, 2.9],
  [250, 140, 1.4, 0.2],
];

function Snowflakes() {
  return (
    <g>
      {SNOWFLAKE_POSITIONS.map(([x, y, r, delay], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill="var(--scene-snow)"
          opacity={0.85}
          className="weather-anim-snow"
          style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
        />
      ))}
    </g>
  );
}

function MistBands({ blurId }: { blurId: string }) {
  return (
    <g filter={`url(#${blurId})`}>
      <rect x={-40} y={30} width={480} height={16} fill="var(--scene-mist)" opacity={0.55} className="weather-anim-mist" />
      <rect x={-40} y={60} width={480} height={20} fill="var(--scene-mist)" opacity={0.45} />
      <rect x={-40} y={92} width={480} height={17} fill="var(--scene-mist)" opacity={0.5} className="weather-anim-mist" style={{ animationDelay: "6s" }} />
      <rect x={-40} y={120} width={480} height={14} fill="var(--scene-mist)" opacity={0.4} />
    </g>
  );
}

/*
 * `preserveAspectRatio="xMidYMid meet"` (i.e. NIET "slice") is bewust
 * gekozen: de hero-kaart varieert enorm in beeldverhouding (breed op
 * desktop, bijna vierkant op mobiel, zie `WeatherHero`). "meet" schaalt de
 * illustratie zodat ze altijd volledig zichtbaar blijft — nooit een
 * afgesneden zon/maan — en laat op een afwijkende beeldverhouding gewoon
 * wat van de kale achtergrondgradient rondom zien, wat zelf ook al rustig
 * oogt. Dat is ook precies wat er nodig is voor punt 10 uit de opdracht: op
 * mobiel mag/moet de illustratie eenvoudiger ogen dan op desktop.
 */
export function WeatherSceneArt({ scene }: { scene: WeatherScene }) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const softBlur = `${uid}-soft`;
  const strongBlur = `${uid}-strong`;
  const sunGlow = `${uid}-sun-glow`;
  const moonGlow = `${uid}-moon-glow`;

  return (
    <svg
      className="weather-scene-art"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={softBlur} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={strongBlur} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <radialGradient id={sunGlow}>
          <stop offset="0%" stopColor="var(--scene-sun)" stopOpacity={0.55} />
          <stop offset="100%" stopColor="var(--scene-sun)" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={moonGlow}>
          <stop offset="0%" stopColor="var(--scene-moon)" stopOpacity={0.4} />
          <stop offset="100%" stopColor="var(--scene-moon)" stopOpacity={0} />
        </radialGradient>
      </defs>

      {scene === "helder" && (
        <>
          <SunDisc cx={318} cy={38} r={22} glowId={sunGlow} />
          <Horizon opacity={0.22} />
        </>
      )}

      {scene === "half-bewolkt" && (
        <>
          <SunDisc cx={300} cy={34} r={17} glowId={sunGlow} />
          <CloudBlob cx={125} cy={78} scale={1.1} fill="var(--scene-cloud)" opacity={0.8} filterId={softBlur} className="weather-anim-cloud" />
          <CloudBlob cx={290} cy={92} scale={0.8} fill="var(--scene-cloud)" opacity={0.55} filterId={softBlur} className="weather-anim-cloud-slow" />
          <Horizon opacity={0.25} />
        </>
      )}

      {scene === "bewolkt" && (
        <>
          <CloudBlob cx={105} cy={48} scale={1.35} fill="var(--scene-cloud)" opacity={0.55} filterId={softBlur} className="weather-anim-cloud" />
          <CloudBlob cx={270} cy={36} scale={1.1} fill="var(--scene-cloud-2)" opacity={0.45} filterId={softBlur} className="weather-anim-cloud-slow" />
          <CloudBlob cx={205} cy={95} scale={1.4} fill="var(--scene-cloud)" opacity={0.4} filterId={softBlur} className="weather-anim-cloud-slow" />
          <Horizon opacity={0.3} />
        </>
      )}

      {scene === "mist" && (
        <>
          <MistBands blurId={strongBlur} />
          <Horizon opacity={0.2} />
        </>
      )}

      {scene === "regen" && (
        <>
          <CloudBlob cx={115} cy={38} scale={1.25} fill="var(--scene-cloud)" opacity={0.65} filterId={softBlur} className="weather-anim-cloud" />
          <CloudBlob cx={275} cy={28} scale={1.1} fill="var(--scene-cloud-2)" opacity={0.55} filterId={softBlur} className="weather-anim-cloud-slow" />
          <RainStreaks originX={80} count={11} opacity={0.55} />
          <Horizon opacity={0.4} />
        </>
      )}

      {scene === "zware-regen" && (
        <>
          <CloudBlob cx={108} cy={32} scale={1.4} fill="var(--scene-cloud)" opacity={0.75} filterId={softBlur} className="weather-anim-cloud" />
          <CloudBlob cx={258} cy={25} scale={1.25} fill="var(--scene-cloud-2)" opacity={0.65} filterId={softBlur} className="weather-anim-cloud-slow" />
          <CloudBlob cx={188} cy={52} scale={1.1} fill="var(--scene-cloud-2)" opacity={0.55} filterId={softBlur} className="weather-anim-cloud" />
          <RainStreaks originX={60} count={18} opacity={0.7} />
          <Horizon opacity={0.5} />
        </>
      )}

      {scene === "sneeuw" && (
        <>
          <CloudBlob cx={128} cy={38} scale={1.2} fill="var(--scene-cloud)" opacity={0.7} filterId={softBlur} className="weather-anim-cloud" />
          <CloudBlob cx={272} cy={28} scale={1} fill="var(--scene-cloud-2)" opacity={0.55} filterId={softBlur} className="weather-anim-cloud-slow" />
          <Snowflakes />
          <Horizon opacity={0.3} />
        </>
      )}

      {scene === "zonsopkomst" && (
        <>
          <SunDisc cx={205} cy={122} r={26} glowId={sunGlow} />
          <CloudBlob cx={325} cy={88} scale={0.6} fill="var(--scene-cloud)" opacity={0.3} filterId={softBlur} className="weather-anim-cloud-slow" />
          <Horizon opacity={0.35} />
        </>
      )}

      {scene === "zonsondergang" && (
        <>
          <SunDisc cx={215} cy={125} r={26} glowId={sunGlow} />
          <CloudBlob cx={85} cy={85} scale={0.6} fill="var(--scene-cloud)" opacity={0.3} filterId={softBlur} className="weather-anim-cloud-slow" />
          <Horizon opacity={0.4} />
        </>
      )}

      {scene === "nacht" && (
        <>
          <Stars />
          <MoonDisc cx={312} cy={36} r={16} glowId={moonGlow} />
          <Horizon opacity={0.5} />
        </>
      )}
    </svg>
  );
}
