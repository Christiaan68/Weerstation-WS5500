/**
 * Centrale definitie van de navigatie, gedeeld door de desktop- en mobiele
 * navigatie zodat ze nooit uit sync kunnen raken.
 */
export interface NavItem {
  href: string;
  label: string;
}

/**
 * Hoofdnavigatie: de horizontale balk op desktop (zie main-nav.tsx) en de
 * bovenste groep in het hamburgermenu op smalle schermen.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/data", label: "Data" },
  { href: "/grafieken", label: "Grafieken" },
  { href: "/regen", label: "Regen" },
  { href: "/wind", label: "Wind" },
  { href: "/records", label: "Records" },
];

/**
 * Pagina's die alleen in het hamburgermenu (links van het logo) staan, op
 * álle schermbreedtes. "Weerstations" is één menu-item voor alles rond de
 * stations: kiezen en bekijken (tabblad Overzicht) en toevoegen/bewerken
 * (tabblad Beheer) — zie src/app/station/station-tabs.tsx.
 */
export const MENU_ITEMS: NavItem[] = [
  { href: "/data-quality", label: "Datakwaliteit" },
  { href: "/station", label: "Weerstations" },
];
