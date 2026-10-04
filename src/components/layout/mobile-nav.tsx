"use client";

import { ChevronDown, LogOut, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { logout } from "@/app/login/actions";
import { StationAdminDialog } from "@/components/layout/station-admin-dialog";
import { MENU_ITEMS, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Hamburgermenu links van het logo, op álle schermbreedtes.
 *
 * - Desktop (>= lg): alleen Datakwaliteit, Stationoverzicht en Stationbeheer; de rest van
 *   de navigatie staat al in de horizontale balk (main-nav.tsx).
 * - Smalle schermen (< lg): ook de hoofdnavigatie, want de
 *   horizontale balk is daar verborgen. Datakwaliteit, Stationoverzicht en Stationbeheer
 *   staan daar gegroepeerd onder het uitklapbare item "Systeem".
 *
 * Stationbeheer is geen pagina meer maar een venster over de huidige pagina
 * (station-admin-dialog.tsx); alleen zichtbaar voor een ingelogde bezoeker.
 */
export function MobileNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  // Smalle schermen: Datakwaliteit, Stationoverzicht en Stationbeheer staan onder
  // één uitklapbaar item "Systeem"; vanaf lg staan ze plat in het menu.
  const [systemOpen, setSystemOpen] = useState(false);
  const pathname = usePathname();
  // Fase 5.2: zie main-nav.tsx — dezelfde reden om de gekozen station mee te
  // sturen bij navigatie via het menu.
  const currentStation = useSearchParams().get("station");

  // Sluit het menu automatisch bij navigatie naar een andere pagina. Dit
  // past state tijdens het renderen aan (React's aanbevolen patroon om
  // state te synchroniseren met een gewijzigde externe waarde), in plaats
  // van een `useEffect` met een `setState`-aanroep.
  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setOpen(false);
  }

  // Voorkom scrollen van de achtergrond terwijl het menu als paneel over
  // het scherm staat (alleen op smalle schermen; op desktop is het een
  // klein uitklapmenu en mag de pagina gewoon scrollen).
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Escape sluit het menu.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function renderLink(item: NavItem) {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const href = currentStation
      ? `${item.href}?station=${encodeURIComponent(currentStation)}`
      : item.href;
    return (
      <Link
        key={item.href}
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-3 text-base font-medium lg:py-2 lg:text-sm",
          isActive && "bg-accent text-accent-foreground",
        )}
      >
        {item.label}
      </Link>
    );
  }

  const systemItems = (
    <>
      {MENU_ITEMS.map(renderLink)}
      {isLoggedIn && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setAdminOpen(true);
          }}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-base font-medium lg:py-2 lg:text-sm"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Stationbeheer
        </button>
      )}
    </>
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="hoofdmenu"
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
        <>
          {/* Afgedimde achtergrond onder het paneel — zonder deze laag bleef
              de rest van de pagina (kaarten eronder) gewoon zichtbaar met een
              harde rand op het punt waar het paneel stopt, wat oogde als een
              kapot/half openend menu. Sluit het menu ook bij een klik erop.
              Op desktop onzichtbaar, maar nog wel klikbaar om te sluiten. */}
          <div
            className="fixed inset-x-0 top-16 bottom-0 z-40 bg-black/40 lg:bg-transparent"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            id="hoofdmenu"
            className="border-border bg-background fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b shadow-lg lg:inset-x-auto lg:top-[4.25rem] lg:left-4 lg:w-64 lg:rounded-md lg:border"
          >
            <nav aria-label="Menu" className="flex flex-col gap-1 p-4 lg:p-2">
              {/* Hoofdnavigatie: alleen hier nodig op smalle schermen. */}
              <div className="flex flex-col gap-1 lg:hidden">
                {NAV_ITEMS.map(renderLink)}
                <div className="border-border my-1 border-t" />
              </div>

              {/* Dezelfde drie items, op twee manieren getoond: plat vanaf lg,
                  onder het uitklapbare item "Systeem" op smalle schermen. */}
              <div className="hidden flex-col gap-1 lg:flex">{systemItems}</div>
              <div className="flex flex-col lg:hidden">
                <button
                  type="button"
                  onClick={() => setSystemOpen((value) => !value)}
                  aria-expanded={systemOpen}
                  aria-controls="systeem-items"
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-base font-medium"
                >
                  Systeem
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", systemOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
                {systemOpen && (
                  <div
                    id="systeem-items"
                    className="border-border mt-1 ml-3 flex flex-col gap-1 border-l pl-2"
                  >
                    {systemItems}
                  </div>
                )}
              </div>

              {/* Uitloggen: vanaf sm staat de knop al rechts in de header. */}
              {isLoggedIn && (
                <form action={logout} className="border-border mt-2 border-t pt-3 sm:hidden">
                  <button
                    type="submit"
                    className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-3 py-3 text-base font-medium"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Uitloggen
                  </button>
                </form>
              )}
            </nav>
          </div>
        </>
      )}

      {adminOpen && <StationAdminDialog onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
