# Alecto WS5500 Weerstation — Fase 2

Cloudgebaseerd dashboard voor actuele en historische weergegevens van een
Alecto WS5500 weerstation. **Fase 1** legde de technische fundering
(database, infrastructuur, basislayout). **Fase 2** (dit document) voegt de
volledige **data-ingestie** toe: het betrouwbaar ontvangen, ongewijzigd
opslaan, parsen, normaliseren en diagnosticeren van alle data die het
station kan versturen — nog **geen** grafieken, statistieken of records,
zie [Volgende fases](#volgende-fases).

Geen Raspberry Pi, NAS of thuisserver nodig: de architectuur is volledig
cloud-based (GitHub → Vercel/Next.js → TiDB Cloud).

## Inhoud

- [Stack](#stack)
- [Architectuur](#architectuur)
- [Installatie](#installatie)
- [Environment variables](#environment-variables)
- [TiDB Cloud setup](#tidb-cloud-setup)
- [Database migrations](#database-migrations)
- [Seed en demo-data](#seed-en-demo-data)
- [Development starten](#development-starten)
- [WS5500 data-ingestie (Fase 2)](#ws5500-data-ingestie-fase-2)
- [Tests](#tests)
- [Production build](#production-build)
- [Deployment naar Vercel](#deployment-naar-vercel)
- [Volgende fases](#volgende-fases)

## Stack

- **Next.js** (App Router) + **TypeScript** (strict mode) + **React**
- **Tailwind CSS 4**
- **TiDB Cloud** (MySQL-compatible, serverless) als database
- **Drizzle ORM** (zie [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §4 voor
  de afweging tegenover Prisma)
- **Zod** voor environment-validatie
- **Vitest** voor unit tests
- **ESLint** + **Prettier**
- **Vercel** als hostingplatform, **GitHub Actions** als CI

Volledige architectuurkeuzes, tabelontwerp, indexering en
schaalbaarheidsoverwegingen staan in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Architectuur

```
GitHub
  |
  v
Next.js / Vercel
  |
  v
TiDB Cloud
```

Zie [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) voor het volledige
diagram inclusief de toekomstige koppeling met de WS5500.

## Installatie

Vereist: Node.js 20+ en npm.

```powershell
git clone https://github.com/<jouw-gebruikersnaam>/weerstation-ws5500.git
cd weerstation-ws5500
npm install
```

## Environment variables

Kopieer `.env.example` naar `.env.local` en vul de waarden in:

```powershell
Copy-Item .env.example .env.local
```

| Variabele                                                            | Verplicht                                       | Omschrijving                                                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                       | Ja                                              | TiDB Cloud connection string. Zie [TiDB Cloud setup](#tidb-cloud-setup).                                                                                             |
| `NEXT_PUBLIC_STATION_NAME`                                           | Nee (default `Alecto WS5500`)                   | Naam die in de UI getoond wordt.                                                                                                                                     |
| `NEXT_PUBLIC_TIMEZONE`                                               | Nee (default `Europe/Amsterdam`)                | Tijdzone voor presentatie en kalenderaggregaties.                                                                                                                    |
| `NEXT_PUBLIC_DEMO_MODE`                                              | Nee (default `false`)                           | Toont een "Demo-gegevens"-label als er (nog) geen echte stationdata is.                                                                                              |
| `WEATHER_INGEST_SECRET`                                              | Ja, voor ingestie                               | Geheime waarde in het pad van `/api/weather/ingest/<secret>` en `/api/weather/providers/ecowitt-cloud/<secret>`. Zie [`docs/WS5500_SETUP.md`](docs/WS5500_SETUP.md). |
| `STATION_DIAGNOSTICS_SECRET`                                         | Nee (leeg = pagina uitgeschakeld)               | Sleutel voor `/station/diagnostics?key=...`. Bewust een **andere** waarde dan `WEATHER_INGEST_SECRET`.                                                               |
| `ECOWITT_APPLICATION_KEY` / `ECOWITT_API_KEY` / `ECOWITT_DEVICE_MAC` | Nee, alleen voor de Ecowitt Cloud-fallbackroute | Zie [`docs/WS5500_SETUP.md`](docs/WS5500_SETUP.md) §5.                                                                                                               |

Alle variabelen worden bij gebruik gevalideerd met Zod
(`src/lib/env.ts`). Server-only variabelen (zoals `DATABASE_URL`) komen
nooit in de browserbundle terecht; alleen `NEXT_PUBLIC_*`-variabelen zijn
client-veilig.

**Zet nooit echte geheimen in git.** `.env.local` staat in `.gitignore`.

## TiDB Cloud setup

Volledige stap-voor-stapinstructies (account, cluster, gebruiker, SSL,
`DATABASE_URL` samenstellen, lokaal en in Vercel instellen) staan in
[`docs/TIDB_SETUP.md`](docs/TIDB_SETUP.md).

## Database migrations

Migraties zijn gewone SQL-bestanden in `db/migrations/`, gegenereerd met
Drizzle Kit vanuit `src/lib/db/schema.ts`.

```powershell
# Migratie(s) genereren vanuit het schema (na een schemawijziging)
npm run db:generate

# Migraties uitvoeren tegen de database in DATABASE_URL
npm run db:migrate

# Optioneel: schema direct pushen zonder migratiebestand (alleen handig
# tijdens snelle lokale iteratie — gebruik db:generate + db:migrate als
# vaste procedure, ook in productie)
npm run db:push

# Optioneel: Drizzle Studio openen om de database visueel te bekijken
npm run db:studio
```

## Seed en demo-data

```powershell
# Maakt (of werkt bij) het demo-station "Mijn Alecto WS5500"
npm run db:seed

# Genereert ~24 uur fictieve weermetingen (herkenbaar aan source =
# "demo_generator"), zodat dashboard/station iets te tonen hebben
npm run demo

# Verwijdert alle door npm run demo gegenereerde data weer
npm run demo:clear
```

Zet `NEXT_PUBLIC_DEMO_MODE=true` zodat de UI duidelijk "Demo-gegevens"
toont zolang er geen echte stationdata binnenkomt.

## Development starten

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). De statuspagina
(`/`) en het dashboard (`/dashboard`) tonen live de databasestatus en
(indien aanwezig) de laatste meting (elke ~60 seconden automatisch
ververst).

## WS5500 data-ingestie (Fase 2)

Twee routes leveren data aan, via één gedeelde parser/normalisatielaag:

- **Rechtstreekse upload** — `POST/GET /api/weather/ingest/<WEATHER_INGEST_SECRET>`.
  Waarschijnlijk **niet bruikbaar** zonder tussenstap: de WS5500's
  "Customized"-uploadmodus ondersteunt in de praktijk geen TLS, en Vercel
  accepteert alleen HTTPS. Zie de analyse in
  [`docs/WS5500_INGESTION.md`](docs/WS5500_INGESTION.md).
- **Ecowitt Cloud API (aanbevolen)** — `GET /api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>`
  haalt de actuele meting op bij Ecowitt.net (waar het station wél
  rechtstreeks naartoe kan uploaden) en verwerkt die via dezelfde
  pijplijn. Vereist een externe periodieke trigger (bv. cron-job.org) —
  Vercel Functions draaien niet vanzelf periodiek.

Volledige koppelinstructies (PASSKEY opzoeken, environment variables,
stationconfiguratie, Ecowitt-account): [`docs/WS5500_SETUP.md`](docs/WS5500_SETUP.md).
Architectuur, beveiliging, deduplicatie en ontwerpkeuzes:
[`docs/WS5500_INGESTION.md`](docs/WS5500_INGESTION.md). Veldreferentie en
hoe een nieuw/onbekend veld toe te voegen:
[`docs/ECOWITT_FIELDS.md`](docs/ECOWITT_FIELDS.md).

Diagnose en beheer:

- **`/station/diagnostics?key=<STATION_DIAGNOSTICS_SECRET>`** — overzicht
  van binnengekomen pakketten, verwerkingsstatus, onbekende velden en
  Ecowitt Cloud-status; klik een pakket open voor het volledige (redacted)
  ruwe payload en de afgeleide meting.
- **`GET /api/weather/current`** — actuele, genormaliseerde meting (geen
  cache).
- **`GET /api/weather/station/status`** — stationconfiguratie (zonder het
  echte PASSKEY prijs te geven) en pakketstatistieken.

Scripts:

```powershell
# Stuurt een testpayload naar het ingestie-endpoint (lokaal of live)
npm run weather:test-payload -- --fixture=full-payload

# Verwerkt eerder ontvangen ruwe pakketten opnieuw met de huidige parser
npm run weather:reprocess -- 42

# Toont welke velden de parser recent niet herkende
npm run weather:unknown-fields
```

## Tests

```powershell
npm run typecheck   # TypeScript, strict mode
npm run lint        # ESLint
npm run test        # Vitest (eenheidsconversies, environment-validatie, parser, ingestiepijplijn)
npm run format:check  # Prettier (controleren zonder te wijzigen)
```

`npm run typecheck` genereert eerst automatisch Next.js' route-types
(`next typegen`) en voert daarna `tsc --noEmit` uit.

Databasetests vereisen **geen** live TiDB-verbinding: de databaselaag is zo
gebouwd dat modules importeren nooit verbinding maakt (zie
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §6). De ingestiepijplijn
wordt getest via een gemockte `@/lib/db/queries`-laag
(`tests/weather-ingest-pipeline.test.ts`); parser, tijdstip-, hash- en
redactielogica zijn pure-functietests (`tests/weather-*.test.ts`) — samen
met `tests/env.test.ts`/`tests/units.test.ts` meer dan 100 tests, waaronder
een expliciete test die bewijst dat een payload met deels foute velden
nooit tot volledig dataverlies leidt.

## Production build

```powershell
npm run build
npm run start
```

De build slaagt ook **zonder** geldige `DATABASE_URL` (handig voor CI en
voor een eerste deploy vóórdat TiDB is ingericht) — de databaseverbinding
wordt pas bij een echt binnenkomend request opgezet, nooit tijdens de
build zelf.

## Deployment naar Vercel

Volledige stap-voor-stapinstructies (GitHub-repository, project
importeren, environment variables, deployment, `/api/health` controleren,
custom domain) staan in [`docs/VERCEL_SETUP.md`](docs/VERCEL_SETUP.md).

## Volgende fases

Fase 2 bouwt bewust **geen**:

- 24-uurs grafieken, windroos, regenrapporten, jaaroverzichten;
- recordpagina, CSV-export, historische data-explorer;
- notificaties, weersvoorspellingen, externe publieke API;
- uitgebreid accountsysteem.

De ingestiepijplijn, het genormaliseerde datamodel en de diagnostiek staan
wel al klaar zodat dit in latere fases zonder herontwerp toegevoegd kan
worden.

**Fase 2 gereed voor Fase 3: dashboard en actuele weerweergave.**
