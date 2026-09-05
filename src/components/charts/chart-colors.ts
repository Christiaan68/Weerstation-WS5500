/**
 * Vast, herbruikbaar kleurenpalet voor meerdere lijnen/balken in één
 * grafiek (Fase 3: `/grafieken`, dashboard-24u-grafiek, `/regen`, `/wind`).
 * Bewust GEEN CSS-variabelen zoals `--primary` (die zijn semantisch bedoeld
 * voor UI-elementen, niet voor N onderscheidbare datareeksen) — vaste,
 * middelverzadigde kleuren die op zowel de lichte als donkere achtergrond
 * van dit thema (zie globals.css) voldoende contrast houden.
 */
export const CHART_SERIES_COLORS = [
  "#0ea5e9", // sky-500
  "#f97316", // orange-500
  "#8b5cf6", // violet-500
  "#22c55e", // green-500
  "#ef4444", // red-500
  "#eab308", // yellow-500
] as const;

export function chartColorFor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]!;
}

/** Neutrale kleuren voor assen/gridlijnen — volgen het thema via CSS-variabelen. */
export const CHART_GRID_COLOR = "var(--border)";
export const CHART_AXIS_COLOR = "var(--muted-foreground)";
