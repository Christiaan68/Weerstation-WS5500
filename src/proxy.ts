/**
 * Proxy (Next.js 16's vervanger van het vroegere `middleware.ts` — zie
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * proxy.md`): draait vóórdat een route gerenderd wordt, buiten React om.
 *
 * Sinds Fase 7 is dit de centrale plek die op VRIJWEL elk verzoek een
 * geldige sessiecookie afdwingt (de site-brede gebruikersnaam/wachtwoord-
 * login — zie `src/lib/auth/session.ts` voor hoe die cookie ondertekend en
 * gecontroleerd wordt). Dit vervangt de losse `?key=`-sleutels die eerder
 * alleen `/station/diagnostics` beveiligden (Fase 2) — de rest van de site
 * was daarvoor publiek toegankelijk.
 *
 * UITGEZONDERD van de "geldige sessie vereist"-controle (zie
 * `config.matcher` hieronder — `/login` loopt WEL door de matcher, want
 * die heeft een eigen kleine behandeling hierbeneden):
 *  - `/api/weather/ingest/:path*` en
 *    `/api/weather/providers/ecowitt-cloud/:path*` — worden aangeroepen
 *    door het fysieke station, resp. een externe cron-pinger (bv.
 *    cron-job.org) — geen browser met een sessiecookie. Blijven beveiligd
 *    met hun eigen `WEATHER_INGEST_SECRET`-in-het-pad, ongewijzigd t.o.v.
 *    Fase 2/5 (zie die route-bestanden).
 *  - `/api/health` — publieke uptime-check zonder gevoelige data.
 *  - statische bestanden (`_next/static`, `_next/image`, favicon, manifest,
 *    iconen).
 *
 * Alle overige pagina's EN alle overige `/api/weather/*`-endpoints (die de
 * pagina's zelf vanuit de browser aanroepen) vereisen dus een geldige
 * sessie — inclusief `/admin/stations` en `/station/diagnostics`, die
 * vroeger hun eigen `STATION_ADMIN_SECRET`/`STATION_DIAGNOSTICS_SECRET`
 * hadden. Server Actions op zulke pagina's lopen over hetzelfde pad en zijn
 * dus AL gedekt door deze matcher — maar volgens Next.js' eigen
 * aanbeveling ("Server Functions are not separate routes... verify
 * authentication inside each Server Function") controleert
 * `src/app/admin/stations/actions.ts` de sessie ook zelf, onafhankelijk van
 * deze proxy.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import {
  STATION_PREFERENCE_COOKIE,
  shouldRestoreStation,
} from "@/lib/station-preference";

export const config = {
  matcher: [
    "/((?!api/weather/ingest|api/weather/providers/ecowitt-cloud|api/health|_next/static|_next/image|favicon\\.ico|icon\\.svg$|manifest\\.webmanifest|icons/).*)",
  ],
};

/**
 * Bouwt de doel-URL van een redirect BINNEN deze app. `new URL("/login",
 * request.nextUrl)` zou het `basePath` (/weerstation) weglaten — een pad dat
 * met "/" begint vervangt het hele pad van de basis-URL. `nextUrl.clone()`
 * behoudt het `basePath` (en `pathname` is daar zonder dat prefix).
 */
function redirectUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return url;
}

export default function proxy(request: NextRequest): NextResponse {
  const { SITE_AUTH_SESSION_SECRET } = getServerEnv();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isLoggedIn = verifySessionToken(token, SITE_AUTH_SESSION_SECRET);

  if (request.nextUrl.pathname === "/login") {
    // Een al ingelogde bezoeker die (bv. via een oude bladwijzer) alsnog
    // `/login` opent, hier al doorsturen — i.p.v. pas in `LoginPage` zelf.
    // `LoginPage` roept `redirect()` ook aan (als extra verdedigingslaag),
    // maar doordat de app een globale `src/app/loading.tsx` heeft (die
    // Next.js dwingt om voor élke pagina te gaan streamen) is de
    // HTTP-statuscode dan al als 200 verstuurd tegen de tijd dat die
    // `redirect()` diep in de paginaboom wordt aangeroepen — hier, vóór het
    // renderen begint, kan de statuscode nog wél altijd correct gezet
    // worden. Alleen op GET: een POST is de inlog-Server Action zelf, die
    // moet altijd gewoon kunnen draaien, ook als er toevallig nog een
    // (bijna verlopen) sessie is.
    if (isLoggedIn && request.method === "GET") {
      return NextResponse.redirect(redirectUrl(request, "/dashboard"));
    }
    return NextResponse.next();
  }

  if (isLoggedIn) {
    const preferredStation = request.cookies.get(STATION_PREFERENCE_COOKIE)?.value;
    if (
      request.method === "GET" &&
      preferredStation &&
      /^[a-z0-9-]{1,140}$/.test(preferredStation) &&
      shouldRestoreStation(request.nextUrl.pathname, request.nextUrl.searchParams)
    ) {
      const url = request.nextUrl.clone();
      url.searchParams.set("station", preferredStation);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // API-aanroepen (bv. door de client-side grafieken/tabellen, of een
  // rechtstreekse download-link zoals de raw-packet-export) krijgen een
  // kale 401 terug in plaats van een redirect — `fetch()` kan een
  // HTML-redirectpagina niet zinvol als JSON verwerken, en een download-
  // link hoort niet stilzwijgend een inlogpagina te downloaden.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const loginUrl = redirectUrl(request, "/login");
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next !== "/") {
    loginUrl.searchParams.set("next", next);
  }
  return NextResponse.redirect(loginUrl);
}
