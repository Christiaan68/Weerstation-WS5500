"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Hamburgermenu met uitklapbaar paneel voor smalle schermen (< md). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Sluit het menu automatisch bij navigatie naar een andere pagina. Dit
  // past state tijdens het renderen aan (React's aanbevolen patroon om
  // state te synchroniseren met een gewijzigde externe waarde), in plaats
  // van een `useEffect` met een `setState`-aanroep.
  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setOpen(false);
  }

  // Voorkom scrollen van de achtergrond terwijl het menu open staat.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobiel-menu"
        aria-label={open ? "Sluit menu" : "Open menu"}
        className="border-border text-foreground hover:bg-accent hover:text-accent-foreground flex h-10 w-10 items-center justify-center rounded-md border"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id="mobiel-menu"
          className="border-border bg-background fixed inset-x-0 top-16 z-40 border-b shadow-lg"
        >
          <nav aria-label="Mobiele navigatie" className="flex flex-col gap-1 p-4">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-3 text-base font-medium",
                    isActive && "bg-accent text-accent-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
