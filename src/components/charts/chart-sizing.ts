/**
 * Responsieve hoogtes voor de grafieken (Fase 4.5) — flink platter op
 * telefoon en tablet (vergelijkbaar met de compacte kaartjes in de
 * HomeWizard-app), en ook op laptop/desktop iets platter dan voorheen.
 *
 * Let op: dit zijn bewust volledig uitgeschreven, letterlijke
 * Tailwind-klassen — geen samengestelde strings via variabelen. Tailwind
 * scant de broncode op complete klassenamen tijdens de build; een
 * dynamisch opgebouwde klasse (bv. `h-[${x}px]`) wordt daardoor niet
 * herkend en levert stilzwijgend geen CSS op.
 */
export const CHART_HEIGHT = {
  /** Gegroepeerde mini-grafiekjes op het dashboard (meerdere per kaart). */
  compact: "h-[140px] md:h-[160px] lg:h-[200px]",
  /** Regen-staafgrafiek op /regen. */
  rain: "h-[160px] md:h-[185px] lg:h-[220px]",
  /** Standaard enkele grafiek (dashboard-kaarten met 1 groep). */
  default: "h-[170px] md:h-[200px] lg:h-[260px]",
  /** Hoofdgrafiek op /grafieken. */
  large: "h-[190px] md:h-[230px] lg:h-[300px]",
} as const;

export type ChartHeightVariant = keyof typeof CHART_HEIGHT;
