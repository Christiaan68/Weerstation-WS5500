import { useId } from "react";

/**
 * Verfijnde, gelaagde SVG-illustraties voor de sensorkaarten
 * (`technical-grid.tsx`) — één samenhangende stijl per kaart (wind, regen,
 * atmosfeer, zon), i.p.v. simpele lijniconen. Elke illustratie combineert
 * een zachte, geblurde "gloed"-vorm met scherpere voorgrondvormen voor
 * diepte, getekend in `currentColor` (de kleur komt van de tint-class op
 * de omliggende kaart) met eigen relatieve dekkingen per laag — de kaart
 * zet daar zelf nog een lage totaalopacity overheen, zodat het een sfeerlaag
 * blijft en geen informatie-element wordt. Puur decoratief (`aria-hidden`).
 */

function useSvgId(prefix: string): string {
  const raw = useId();
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function WindArt({ className }: { className?: string }) {
  const blurId = useSvgId("wind-blur");
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" focusable="false">
      <defs>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g filter={`url(#${blurId})`} opacity={0.35}>
        <path
          d="M8 70 C 45 40, 85 40, 118 62 S 175 92, 158 48"
          stroke="currentColor"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M4 92 C 42 66, 80 66, 112 86 S 168 112, 152 74"
        stroke="currentColor"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d="M14 116 C 48 98, 78 98, 104 112 S 150 130, 140 104"
        stroke="currentColor"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        opacity={0.4}
      />
      <path
        d="M28 50 C 54 38, 76 38, 94 48"
        stroke="currentColor"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        opacity={0.3}
      />
    </svg>
  );
}

export function RainArt({ className }: { className?: string }) {
  const blurId = useSvgId("rain-blur");
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" focusable="false">
      <defs>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g filter={`url(#${blurId})`} opacity={0.4}>
        <path d="M28 62 a30 30 0 0 1 58 -8 a22 22 0 0 1 4 43.5 h-70 a20 20 0 0 1 8 -35.5z" fill="currentColor" />
      </g>
      <path
        d="M34 58 a26 26 0 0 1 50 -7 a19 19 0 0 1 3 37.5 h-60 a17 17 0 0 1 7 -30.5z"
        fill="currentColor"
        opacity={0.6}
      />
      <g opacity={0.55} strokeLinecap="round">
        <line x1={46} y1={104} x2={40} y2={122} stroke="currentColor" strokeWidth={4} />
        <line x1={66} y1={108} x2={60} y2={130} stroke="currentColor" strokeWidth={4} />
        <line x1={86} y1={104} x2={80} y2={122} stroke="currentColor" strokeWidth={4} />
      </g>
    </svg>
  );
}

export function AtmosphereArt({ className }: { className?: string }) {
  const blurId = useSvgId("atmos-blur");
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" focusable="false">
      <defs>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g filter={`url(#${blurId})`} opacity={0.4}>
        <circle cx={88} cy={78} r={46} fill="currentColor" />
      </g>
      <path
        d="M10 96 C 34 60, 58 122, 82 86 S 130 56, 152 74"
        stroke="currentColor"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        opacity={0.75}
      />
      <path
        d="M18 118 C 40 92, 62 132, 84 108 S 124 88, 146 100"
        stroke="currentColor"
        strokeWidth={3.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.45}
      />
      <circle cx={82} cy={86} r={4.5} fill="currentColor" opacity={0.9} />
    </svg>
  );
}

export function SunArt({ className }: { className?: string }) {
  const blurId = useSvgId("sun-blur");
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" focusable="false">
      <defs>
        <filter id={blurId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <circle cx={92} cy={72} r={52} fill="currentColor" opacity={0.22} filter={`url(#${blurId})`} />
      <g opacity={0.4}>
        {rays.map((a) => {
          const rad = (a * Math.PI) / 180;
          const x1 = 92 + 34 * Math.cos(rad);
          const y1 = 72 + 34 * Math.sin(rad);
          const x2 = 92 + 50 * Math.cos(rad);
          const y2 = 72 + 50 * Math.sin(rad);
          return (
            <line
              key={a}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}
      </g>
      <circle cx={92} cy={72} r={26} fill="currentColor" opacity={0.75} />
    </svg>
  );
}
