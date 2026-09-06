import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
