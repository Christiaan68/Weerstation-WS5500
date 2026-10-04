import type { NextConfig } from "next";

/**
 * Optioneel pad-voorvoegsel (basePath). Standaard LEEG: de app draait op de
 * root van zijn domein (productie: weerstation.tenhaaken.nl, voorheen
 * mijnweerstation.nl).
 *
 * Wil je de app ooit onder een pad van een ander domein hangen (bijv.
 * tenhaaken.nl/weerstation, via een rewrite van dat domein naar dit project),
 * zet dan bij het BOUWEN de environment variable `WEERSTATION_BASE_PATH`
 * (bv. `/weerstation`) — zie docs/DOMEIN_TENHAAKEN.md. De waarde wordt in de
 * client-bundels ingevuld en als `NEXT_PUBLIC_BASE_PATH` beschikbaar gemaakt
 * voor `src/lib/base-path.ts` (gewone `fetch`/`<a href>`/cookie/manifest
 * krijgen het prefix niet vanzelf).
 */
const BASE_PATH = process.env.WEERSTATION_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  /**
   * Fase 4.2 consolideerde de oude "Historie"-pagina (Fase 3, eenvoudige
   * datumfilter) in de nieuwe, uitgebreidere "Data"-pagina (filters op
   * bron/kwaliteit, sorteren, kolommen kiezen, CSV-export, rijdetail).
   * Bestaande links/bladwijzers naar /historie blijven zo werken.
   */
  async redirects() {
    return [
      {
        source: "/historie",
        destination: "/data",
        permanent: true,
      },
      /**
       * De losse landingspagina (statusblok + knoppen) is vervallen — de app
       * start nu meteen op het dashboard. Bestaande links/bladwijzers naar de
       * root blijven zo werken.
       */
      {
        source: "/",
        destination: "/dashboard",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
