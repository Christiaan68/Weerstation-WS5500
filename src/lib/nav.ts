/**
 * Centrale definitie van de hoofdnavigatie, gedeeld door de desktop- en
 * mobiele navigatie zodat ze nooit uit sync kunnen raken.
 */
export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/historie", label: "Historie" },
  { href: "/data", label: "Data" },
  { href: "/grafieken", label: "Grafieken" },
  { href: "/regen", label: "Regen" },
  { href: "/wind", label: "Wind" },
  { href: "/records", label: "Records" },
  { href: "/data-quality", label: "Kwaliteit" },
  { href: "/station", label: "Station" },
];
