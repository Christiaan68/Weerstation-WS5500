"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Licht", icon: Sun },
  { value: "dark", label: "Donker", icon: Moon },
] as const;

/**
 * Schakelaar voor licht/donker thema. Bij eerste bezoek (nog geen keuze
 * opgeslagen) volgt het thema automatisch het systeemthema — zie
 * `defaultTheme="system"` in `theme-provider.tsx` — maar handmatig kiezen
 * kan alleen tussen licht en donker. Toont pas na mount echte iconen, om een
 * hydration-mismatch (server weet het gekozen thema nog niet) te voorkomen.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  return (
    <div
      className="border-border bg-card inline-flex items-center gap-0.5 rounded-full border p-0.5"
      role="group"
      aria-label="Kies thema"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        // `resolvedTheme` i.p.v. `theme`: bij een systeemvoorkeur (nog geen
        // expliciete keuze) toont dit alsnog het daadwerkelijk actieve
        // thema als actief, i.p.v. geen van beide knoppen.
        const isActive = mounted && resolvedTheme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={isActive}
            aria-label={`${label} thema`}
            title={`${label} thema`}
            className={cn(
              "text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              isActive && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
