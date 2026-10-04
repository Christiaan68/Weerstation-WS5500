/**
 * Het pad-voorvoegsel (basePath) waaronder deze app draait. Standaard leeg:
 * de app draait op de root van zijn domein (weerstation.tenhaaken.nl).
 *
 * De waarde komt uit `next.config.ts` (`env.NEXT_PUBLIC_BASE_PATH`, dezelfde
 * constante als de `basePath`-instelling zelf, gevuld via de build-time
 * variabele `WEERSTATION_BASE_PATH`) en wordt bij het bouwen in de code
 * ingevuld. Leeg (geen prefix) als de variabele ontbreekt — zo blijven unit
 * tests en een run zonder basePath gewoon werken.
 *
 * Next.js zet `basePath` zelf voor `<Link>`, `redirect()` en
 * `router.push()`. NIET voor een gewone `fetch("/api/...")`, een gewone
 * `<a href="/...">`, cookies of paden in het manifest: gebruik daar
 * `withBasePath()`.
 */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Zet het basePath-voorvoegsel voor een absoluut pad binnen deze app ("/api/..." → "/weerstation/api/..."). */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
