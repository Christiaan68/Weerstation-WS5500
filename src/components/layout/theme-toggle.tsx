"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Licht", icon: Sun },
  { value: "dark", label: "Donker", icon: Moon },
  { value: "system", label: "Systeem", icon: Monitor },
] as const;

/**
 * Drieledige schakelaar voor licht / donker / systeemthema. Toont pas na
 * mount echte iconen, om een hydration-mismatch (server weet het gekozen
 * thema nog niet) te voorkomen.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();

  return (
    <div
      className="border-border bg-card inline-flex items-center gap-0.5 rounded-full border p-0.5"
      role="group"
      aria-label="Kies thema"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = mounted && theme === value;
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
