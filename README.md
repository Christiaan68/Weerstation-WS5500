# Alecto WS5500 Weerstation — Fase 3

Cloudgebaseerd dashboard voor actuele en historische weergegevens van een
Alecto WS5500 weerstation. **Fase 1** legde de technische fundering
(database, infrastructuur, basislayout). **Fase 2** voegde de volledige
**data-ingestie** toe (ontvangen, opslaan, parsen, normaliseren,
diagnosticeren). **Fase 3** (dit document) bouwt daarbovenop het
**live dashboard, historie en de weerstatistieken**: automatische
achtergrond-ingestie via een cronjob, dag/maand/jaar-samenvattingen,
downsamplede grafieken, regen-, wind- en recordspagina's, en een
gepagineerde historieverkenner — allemaal op basis van echte,
genormaliseerde stationdata. Zie [Buiten scope](#buiten-scope) voor wat
bewust nog niet gebouwd is.

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
- [Automatische ingestie en statistieken (Fase 3)](#automatische-ingestie-en-statistieken-fase-3)
- [Pagina's](#paginas)
- [Meerdere weerstations (Fase 5)](#meerdere-weerstations-fase-5)
- [Tests](#tests)
- [Production build](#production-build)
- [Deployment naar Vercel](#deployment-naar-vercel)
- [Buiten scope](#buiten-scope)

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
| `STATION_ADMIN_SECRET`                                               | Nee (leeg = beheerscherm uitgeschakeld)         | Sleutel voor `/admin/stations?key=...` (Fase 5.2 — stations toevoegen/bewerken). Bewust een **andere** waarde dan `STATION_DIAGNOSTICS_SECRET`: dit scherm geeft schrijftoegang, de diagnosepagina alleen leestoegang. |
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

## Automatische ingestie en statistieken (Fase 3)

Een externe cronjob (cron-job.org, elke 5 minuten) roept
`/api/weather/providers/ecowitt-cloud/<secret>` automatisch aan — geen
handmatige actie meer nodig. Volledige onderbouwing en instelinstructies:
[`docs/AUTOMATIC_INGESTION.md`](docs/AUTOMATIC_INGESTION.md). De cronjob-
status ("Actief"/"Vertraagd"/"Offline") is zichtbaar op `/station`.

Na elke geslaagde meting worden de dag/maand/jaar-samenvattingen
(`daily_weather_summary`/`monthly_weather_summary`/`yearly_weather_summary`)
automatisch bijgewerkt. Volledige uitleg van alle rekenlogica (downsampling,
regen-tellerlogica, windroos, records, trends, lokale-kalenderdag-grenzen
met zomer-/wintertijd): [`docs/DATA_AGGREGATION.md`](docs/DATA_AGGREGATION.md).

```powershell
# Herbereken dag/maand/jaar-samenvattingen (standaard: alleen vandaag)
npm run weather:recompute-summaries

# Herbereken een specifieke periode
npm run weather:recompute-summaries -- --from 2026-08-01 --to 2026-08-31

# Herbereken alles sinds de eerste meting (bv. na een reparatiescript)
npm run weather:recompute-summaries -- --all
```

## Pagina's

| Pagina                         | Inhoud                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `/dashboard`                   | Live metingen (auto-ververst) + 24-uursgrafiek (temperatuur/gevoelstemperatuur/dauwpunt).                |
| `/grafieken`                   | Categorie- en periodeselector, tijdreeksgrafieken via `/api/weather/history` (server-side downsampling). |
| `/regen`                       | Neerslag per uur/dag/maand, met correcte tellerdelta-berekening (nooit dubbel tellen).                   |
| `/wind`                        | Interactieve windroos (16 richtingen) + gemiddelde snelheid/hoogste windstoot.                           |
| `/records`                     | Hoogste/laagste waarden per periode (vandaag/maand/jaar/all-time), SQL-side berekend.                    |
| `/historie`                    | Gepagineerde, filterbare lijst van individuele metingen.                                                 |
| `/station`                     | Stationgegevens + cronjob-/ingestiestatus + dekkingspercentage.                                          |
| `/station/diagnostics?key=...` | Beveiligde technische diagnose (ruwe pakketten, parserstatus).                                           |

## Meerdere weerstations (Fase 5)

Sinds Fase 5 kan de applicatie meerdere Ecowitt-compatibele weerstations
tegelijk bedienen (bv. "Achtertuin" naast "Vakantiehuis") — elk met zijn
EIGEN dashboard, historie, grafieken, records, regen-/windoverzicht,
exports en datakwaliteit; nooit vermengd met een ander station. Elk
station heeft zijn eigen tijdzone (lokale-kalendergrenzen), en niet elk
station hoeft dezelfde sensoren te hebben (een ontbrekende sensor toont
"Niet beschikbaar", nooit een verzonnen waarde).

Fase 5.1 legde het fundament — databasemodel, tijdzone- en capability-laag,
de Ecowitt-koppeling voor meerdere apparaten via één cron-aanroep, en een
`?station=`-queryparameter op alle pagina's/API's. Fase 5.2 (huidige stand)
bouwt daar de zichtbare UI bovenop:

- **Stationselector** — verschijnt automatisch in de navigatie (desktop en
  mobiel) zodra er meer dan één station is; de gekozen `?station=` reist mee
  bij het doorklikken.
- **`/admin/stations?key=<STATION_ADMIN_SECRET>`** — beveiligd beheerscherm:
  stations toevoegen (met "verbinding testen" — welke sensoren het apparaat
  daadwerkelijk meldt, vóór opslaan), bewerken, als default instellen,
  activeren/deactiveren.
- **Capability-bewuste kaarten** — een sensorkaart (dashboard-panelen of
  grafiek) verschijnt alleen als dát station die sensor daadwerkelijk heeft;
  geen "Niet beschikbaar"-placeholders meer voor sensoren die het station
  nooit heeft.

Zonder `?station=`-parameter, of met precies één station, blijft alles
werken zoals vóór Fase 5: het bestaande WS5500-station is en blijft het
default-station. Fase 5.3 (volledig testmatrix, productie-uitrol,
eindrapport) volgt nog. Volledige uitleg:
[`docs/MULTI_STATION.md`](docs/MULTI_STATION.md).

## Tests

```powershell
npm run typecheck   # TypeScript, strict mode
npm run lint        # ESLint
npm run test        # Vitest (eenheidsconversies, environment-validatie, parser, ingestiepijplijn, aggregatielogica)
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

## Buiten scope

Bewust (nog) niet gebouwd, zoals afgebakend voor Fase 3:

- weersvoorspellingen;
- e-mail-/push-notificaties bij bijvoorbeeld extreme waarden;
- een gebruikersaccountsysteem (de diagnosepagina gebruikt bewust alleen
  een eenvoudig secret-in-URL-mechanisme, geen login);
- een publieke, gedocumenteerde externe API;
- CSV-/JSON-export van historische data;
- vergelijking met KNMI-data;
- een interactieve kaart;
- ondersteuning voor meerdere stations tegelijk in de UI;
- social-media-deelfunctionaliteit.

Het datamodel (`weather_observations`, de summary-tabellen) en de
service-laag (`src/lib/db/queries.ts`, `src/lib/weather/*`) zijn zo
opgezet dat dit later zonder herontwerp toegevoegd kan worden.

**Fase 3 gereed: live dashboard, historie en weerstatistieken werken met
echte Alecto WS5500-data.**
