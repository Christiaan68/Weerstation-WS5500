"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Terug/vooruit-navigatie voor een periode-tabblad (Grafieken, Regen, Wind,
 * Records — Fase 4.4). Puur presentatie: de aanroeper houdt de `offset`-state
 * bij (0 = huidige/meest recente venster) en bepaalt zelf het label en de
 * grenzen — zo blijft dit ene component herbruikbaar ondanks dat elke pagina
 * andere periode-semantiek heeft (kalenderdag, rollend venster, kalendermaand/
 * -jaar, "alles").
 */
export function PeriodNavigator({
  label,
  onBack,
  onForward,
  forwardDisabled,
}: {
  /** Bv. "5 september 2026" (dag), "30 aug – 5 sep 2026" (venster), "september 2026" (maand), "2026" (jaar). */
  label: string;
  onBack: () => void;
  onForward: () => void;
  /** True zodra je op de huidige/meest recente periode staat — je kunt dan niet verder vooruit. */
  forwardDisabled: boolean;
}) {
  return (
    <div className="border-border bg-background flex items-center gap-1 rounded-md border px-1 py-1">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded p-1 transition-colors"
        aria-label="Vorige periode"
        title="Vorige periode"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="text-foreground min-w-[7.5rem] text-center text-xs font-medium whitespace-nowrap">
        {label}
      </span>
      <button
        type="button"
        onClick={onForward}
        disabled={forwardDisabled}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded p-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
        aria-label="Volgende periode"
        title="Volgende periode"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
