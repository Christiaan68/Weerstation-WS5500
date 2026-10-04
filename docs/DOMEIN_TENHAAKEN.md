# Domein: weerstation.tenhaaken.nl

Sinds oktober 2026 hoort deze app bij **https://weerstation.tenhaaken.nl**
(voorheen `mijnweerstation.nl`). Het is een apart Vercel-project; het
domein `tenhaaken.nl` zelf staat op andere hosting (Cloudflare) en wordt hier
niet voor gebruikt.

## Hoe het gekoppeld is

1. Vercel → project `weerstation-ws-5500` → Settings → Domains: het domein
   `weerstation.tenhaaken.nl` is aan het project toegevoegd.
2. DNS (domein geregistreerd bij TransIP): één `CNAME`-record
   `weerstation` → de waarde die Vercel bij het domein toont (meestal
   `cname.vercel-dns.com.`). Het hoofddomein `tenhaaken.nl` en de
   e-mailrecords (MX/SPF/DKIM) blijven ongemoeid.
3. Er is geen codewijziging nodig: de app draait op de root van het
   subdomein.

## Externe verwijzingen

- **cron-job.org** (haalt elke 5 minuten de Ecowitt-gegevens op):
  `https://weerstation.tenhaaken.nl/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>`
- **Uptime-check:** `https://weerstation.tenhaaken.nl/api/health`
- De Nominatim-`User-Agent` (`src/lib/weather/geocode.ts`) noemt
  `https://weerstation.tenhaaken.nl`.

## Optioneel: de app onder een pad hangen (basePath)

De code ondersteunt dit, maar het staat standaard UIT. Het is bedoeld voor het
geval je de app ooit onder een pad van een ander domein wilt tonen (bijv.
`tenhaaken.nl/weerstation`):

1. Zet bij het bouwen de environment variable `WEERSTATION_BASE_PATH` (bv.
   `/weerstation`, Vercel → Settings → Environment Variables, daarna opnieuw
   deployen). Alle pagina's, API-routes, `_next/static`-bestanden, iconen en
   het manifest staan dan onder dat pad; de root van het project is leeg.
2. Het domein dat het pad aanbiedt moet `/weerstation` en
   `/weerstation/:path*` doorsturen (rewrite) naar het `.vercel.app`-adres van
   dit project. Zie "Multi-Zones" in de Next.js-documentatie
   (`node_modules/next/dist/docs/01-app/02-guides/multi-zones.md`).
3. Voeg in `next.config.ts` `experimental.serverActions.allowedOrigins` toe
   met dat domein, anders weigert Next.js Server Actions (inloggen,
   stationbeheer) die via de rewrite binnenkomen.
4. Het weerstation-project mag dan niet via Vercel Deployment Protection
   achter een Vercel-inlog zitten.

Wat `basePath` NIET vanzelf doet (en hoe dat is opgelost): Next.js zet het
voorvoegsel zelf voor `<Link>`, `redirect()` en `router.push()`. Niet voor
gewone `fetch("/api/...")` en `<a href="/...">` → `withBasePath()` uit
`src/lib/base-path.ts`; niet voor redirects in `src/proxy.ts` →
`redirectUrl()`; niet voor de sessiecookie → pad = basePath (of `/`); niet
voor paden in het manifest en `metadata`. Schrijf je nieuwe code met een
client-side `fetch` of een gewone `<a>` naar een pad in deze app, gebruik dan
`withBasePath()`.
