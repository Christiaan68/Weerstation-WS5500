/**
 * Proxy (Next.js 16's vervanger van het vroegere `middleware.ts` — zie
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`):
 * draait vóórdat een route gerenderd wordt, buiten React om.
 *
 * BELANGRIJKE REDEN dat dit bestand bestaat (en niet alleen de
 * `secretMatches()`/`notFound()`-check binnen `src/app/station/diagnostics`):
 * de app heeft een globale `src/app/loading.tsx`, wat Next.js dwingt om voor
 * ELKE pagina te gaan streamen (een Suspense-grens op het hoogste niveau).
 * Daardoor is de HTTP-statuscode al als 200 verstuurd tegen de tijd dat
 * `notFound()` diep in de paginaboom wordt aangeroepen — geverifieerd met een
 * live productie-build tijdens de eindcontrole van Fase 2: zowel een
 * ontbrekende als een foutieve `key` gaven wél de juiste (lege) inhoud terug,
 * maar altijd met HTTP 200 in plaats van de bedoelde 404. Functioneel geen
 * datalek (er wordt nooit echte diagnose-inhoud verstuurd zonder geldige
 * sleutel), maar wel een schending van de expliciete eis om altijd 404 terug
 * te geven — juist om nooit te bevestigen dat deze route bestaat.
 *
 * Deze proxy draait buiten de React-renderboom (vóór enige HTML-streaming
 * begint), dus hier kan de statuscode wél altijd correct op 404 gezet
 * worden. De check in de pagina's zelf (`notFound()`) blijft daarnaast
 * gewoon bestaan als extra verdedigingslaag (defense in depth) — mocht deze
 * proxy ooit niet draaien (bv. een toekomstige matcher-wijziging), dan blijft
 * de pagina zelf alsnog weigeren de inhoud te tonen, alleen met de verkeerde
 * statuscode.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { secretMatches } from "@/lib/weather/secret";

export const config = {
  matcher: ["/station/diagnostics", "/station/diagnostics/:path*"],
};

export default function proxy(request: NextRequest): NextResponse {
  const key = request.nextUrl.searchParams.get("key") ?? undefined;
  const expected = process.env.STATION_DIAGNOSTICS_SECRET;

  if (!secretMatches(key, expected)) {
    // Bewust een kale, generieke 404 — geen Next.js-pagina/React-rendering
    // erbij halen, zodat er nooit per ongeluk toch iets gerenderd (en dus
    // gestreamd) kan worden vóór de statuscode al vaststaat.
    return new NextResponse("Not found.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
}
