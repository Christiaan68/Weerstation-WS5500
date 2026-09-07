import type { MetadataRoute } from "next";

import { publicEnv } from "@/lib/env";

/**
 * Basis PWA-manifest. Dit is bewust een voorbereiding (zie Fase 1-scope):
 * geen offline-functionaliteit, alleen naam, thema en icoon
 * zodat "toevoegen aan startscherm" er correct uitziet.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${publicEnv.NEXT_PUBLIC_STATION_NAME} Weerstation`,
    short_name: "Mijnweerstation",
    description:
      "Cloudgebaseerd dashboard voor actuele en historische weergegevens van een Alecto WS5500 weerstation.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0369a1",
    lang: "nl",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
