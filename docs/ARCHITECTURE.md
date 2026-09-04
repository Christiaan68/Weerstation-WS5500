# Architectuur — Fase 1

Dit document beschrijft de technische keuzes achter de Fase 1-fundering van
het Alecto WS5500 weerstation-project: een cloud-native weerwebsite zonder
enige lokale server (geen Raspberry Pi, NAS of thuisserver).

## 1. Doel van Fase 1

Fase 1 bouwt uitsluitend de technische fundering:

```
GitHub
  |
  v
Next.js / Vercel
  |
  v
TiDB Cloud
```

Er wordt in deze fase nog **geen** echte data van het weerstation ontvangen.
De uiteindelijke architectuur (fase 2 en verder) wordt:

```
            +-------------------+
            |   Alecto WS5500   |
            |  (toekomstige fase)|
            +---------+---------+
                      |
                      | internet (Ecowitt-protocol / HTTP POST)
                      v
             +------------------+
             | Vercel / Next.js |
             |  (route handler) |
             +---------+--------+
                       |
                       | mysql2 (TLS), lazy connection pool
                       v
                +-------------+
                | TiDB Cloud  |
                +-------------+
                       |
                       v
             +------------------+
             | Next.js website  |
             | (server components)|
             +------------------+
```

## 2. Gekozen stack

| Laag      | Keuze                                                    |
| --------- | -------------------------------------------------------- |
| Framework | Next.js (App Router), TypeScript (strict mode)           |
| UI        | React, Tailwind CSS 4, eigen lichte componenten (zie §3) |
| Database  | TiDB Cloud (MySQL-compatible, serverless)                |
| ORM       | Drizzle ORM (zie §4)                                     |
| Validatie | Zod (environment variables én, later, ingestie-payloads) |
| Tests     | Vitest                                                   |
| Hosting   | Vercel (Node.js-runtime)                                 |
| CI        | GitHub Actions                                           |

Geen PHP, Firebase, WordPress of lokale database — alles is cloud-native en
serverless-vriendelijk.

## 3. UI: geen shadcn/ui-CLI, wel dezelfde aanpak

shadcn/ui zelf is geen package maar een CLI die componenten in de
repository genereert. Voor Fase 1 (basislayout, kaarten, badges, header/nav)
zijn een handvol kleine, zelf geschreven componenten in
`src/components/ui/` sneller en met minder afhankelijkheden te onderhouden
dan de volledige shadcn-toolchain erbij te halen. De styling-aanpak
(Tailwind, `class-variance`-achtige varianten en een `cn()`-helper met
`clsx`/`tailwind-merge`) is dezelfde als shadcn/ui gebruikt, dus de
shadcn/ui-CLI kan in een latere fase alsnog toegevoegd worden zonder de
bestaande structuur om te hoeven gooien.

## 4. ORM-keuze: Drizzle ORM

Overwogen: **Drizzle ORM** versus **Prisma**.

Gekozen voor **Drizzle ORM**, om de volgende redenen (gecontroleerd tegen de
actuele documentatie van Drizzle, TiDB en Vercel):

- **Serverless-vriendelijk zonder extra infrastructuur.** Drizzle praat
  rechtstreeks met de `mysql2`-driver (of een HTTP-driver, voor platformen
  die dat vereisen). Prisma's traditionele query-engine is een apart
  binary-proces; om dat goed op Vercel Functions te laten werken raadt
  Prisma zelf Prisma Accelerate (een betaalde connection-pooling proxy) aan.
  Drizzle heeft die extra laag niet nodig: een kleine, bewust beperkte
  `mysql2`-pool (zie §6) volstaat.
- **TiDB/MySQL-compatibiliteit.** Drizzle's `mysql-core`-dialect is een
  dunne, voorspelbare laag boven standaard MySQL-syntax. TiDB is
  MySQL-protocol-compatible; er is geen TiDB-specifieke ORM-adapter nodig.
- **Migraties als leesbare SQL.** `drizzle-kit generate` produceert gewone
  `.sql`-bestanden (zie `db/migrations/`) die je kunt lezen, reviewen en in
  git bijhouden — geen gegenereerde binary-migratie-state.
- **Minder gewicht, minder magie.** Geen aparte codegen-stap die een
  Node-native binary downloadt (zoals Prisma's `prisma generate` per
  platform doet); dat scheelt complexiteit in CI en op Vercel's
  build-image.
- **Type-veiligheid zonder codegen-drift.** Het schema (`src/lib/db/schema.ts`)
  is gewoon TypeScript; types volgen automatisch mee zonder een aparte
  generate-stap na elke schemawijziging (al blijft `drizzle-kit generate`
  wel nodig voor de SQL-migraties zelf).

Prisma blijft een prima keuze in andere projecten; voor dit specifieke
project (klein, serverless, TiDB, een beginner die geen extra betaalde
proxy-laag wil beheren) is Drizzle het pragmatischere alternatief.

## 5. Database access strategy

Alle databasecommunicatie loopt **uitsluitend server-side**:

- `src/lib/db/index.ts` exporteert `db` (een Drizzle-instantie) en
  `pingDatabase()`. Dit bestand mag nooit in een `'use client'`-bestand
  geïmporteerd worden.
- `src/lib/db/queries.ts` is de service/repository-laag: pagina's en
  API-routes roepen functies als `getStation()`, `getLatestObservation()`,
  `getObservationCount()` en `getDatabaseHealth()` aan, en praten nooit
  rechtstreeks met Drizzle. Dat houdt querylogica op één plek.
- De browser krijgt nooit een `DATABASE_URL` te zien: die staat alleen in
  server-only environment variables (zie `src/lib/env.ts`, dat `NEXT_PUBLIC_*`
  bewust scheidt van server-only variabelen).

## 6. Serverless- en build-aandachtspunten

Dit was het belangrijkste risico om vooraf goed te doorgronden, dus hier
extra aandacht:

- **Lazy connection pool.** De `mysql2`-pool wordt pas aangemaakt bij de
  éérste daadwerkelijke databaseaanroep — niet bij het importeren van
  `src/lib/db/index.ts`. Reden: Next.js voert tijdens `next build` de
  route-modules uit om op te halen welke routes statisch/dynamisch zijn
  ("collecting page data"). Zonder lazy-opzet zou een build zonder
  (geldige) `DATABASE_URL`, of zonder netwerktoegang tot TiDB, kunnen
  falen. Dit is getest: `npm run build` slaagt zowel mét als zónder
  `DATABASE_URL` gezet.
- **`force-dynamic` op databasepagina's.** `/`, `/dashboard`, `/station` en
  `/api/health` exporteren `export const dynamic = "force-dynamic"`, zodat
  Next.js nooit probeert deze statisch te prerenderen (wat anders alsnog
  een databaseaanroep tijdens de build zou triggeren) en de databasestatus
  altijd actueel is.
- **Klein, bewust `connectionLimit`.** Vercel Functions schalen horizontaal
  — bij veel gelijktijdige requests draaien er meerdere functie-instanties
  tegelijk, elk met hun eigen pool. Een kleine limiet per instantie (5)
  voorkomt dat de applicatie gezamenlijk het verbindingsmaximum van TiDB
  Cloud opsoupeert. `queueLimit: 0` en een `connectTimeout` voorkomen dat
  een instantie onbeperkt blijft wachten op een vrije verbinding.
- **Hergebruik binnen één instantie.** Eenmaal aangemaakt wordt de pool
  hergebruikt via een module-singleton (met een `globalThis`-cache in
  development, zodat Next.js' hot-module-reload niet telkens een nieuwe
  pool opent).
- **Node.js-runtime, geen Edge.** De `mysql2`-driver gebruikt Node-only
  TCP-sockets en werkt niet op de Edge-runtime. Next.js 16 gebruikt
  sowieso standaard de Node.js-runtime (Edge is deprecated), dus hier is
  geen aparte `export const runtime = "nodejs"` voor nodig.
- **TLS verplicht.** TiDB Cloud (zowel Serverless als Dedicated) vereist
  een TLS-verbinding. TiDB Serverless gebruikt certificaten van een
  publiek vertrouwde CA, dus het standaard Node.js-certificaatstore
  volstaat (`rejectUnauthorized: true`) — er is geen losse `ca.pem` nodig.
  Zie `docs/TIDB_SETUP.md`.

## 7. Tabelontwerp: raw versus genormaliseerd

Twee lagen, bewust gescheiden:

1. **`raw_weather_packets`** bewaart iedere binnenkomende payload
   **volledig en ongewijzigd** (als JSON), samen met metadata (bron,
   ontvangsttijd, verwerkingsstatus, evt. parseerfout). Dit is de
   "brondata" — als een toekomstige parser een bug blijkt te hebben, kan
   alles opnieuw verwerkt worden zonder dat er data verloren is gegaan.
2. **`weather_observations`** bevat de genormaliseerde, metrische
   hoofdmetingen (temperatuur, luchtvochtigheid, luchtdruk, wind, regen,
   UV, zonnestraling), afgeleid van de ruwe payload. Elke observatie kan
   terugverwijzen naar het brondata-pakket (`raw_packet_id`).
3. **`sensor_measurements`** is een generieke, "wide-to-long"-tabel voor
   toekomstige sensoren die niet in de vaste kolommen van
   `weather_observations` passen (extra temperatuurkanalen, bodemvocht,
   PM2.5/PM10, CO₂, bliksem, waterlekkage, en onbekende toekomstige
   Ecowitt-sensoren). Zo hoeft het schema niet telkens te wijzigen als er
   een nieuw sensortype bijkomt.
4. **`daily_weather_summary` / `monthly_weather_summary` /
   `yearly_weather_summary`** zijn vooraf berekende aggregaties, met een
   unieke sleutel per (station, periode). Deze blijven in Fase 1 leeg —
   ze worden in een latere fase gevuld door een aggregatiejob — maar het
   schema staat al klaar zodat historiequeries later niet telkens over
   miljoenen ruwe rijen hoeven te scannen.
5. **`app_settings`** is een simpele key/value-tabel (JSON-waarde) voor
   toekomstige applicatie-instellingen.

## 8. Keuze primary keys: `BIGINT UNSIGNED AUTO_INCREMENT`

Overwogen: `BIGINT AUTO_INCREMENT`, UUID, ULID.

Gekozen voor **`BIGINT UNSIGNED AUTO_INCREMENT`**, om deze redenen:

- **Compact en snel te indexeren.** 8 bytes per sleutel versus 16 bytes
  voor een UUID — dat scheelt merkbaar in de grootte van alle secundaire
  indexen (bv. `raw_packet_id`, `observation_id`) bij tabellen met
  miljoenen rijen.
- **Sequentieel = efficiënte range-scans.** Historiequeries filteren in de
  praktijk altijd op `(station_id, measured_at)` (zie §9) — niet op de
  primary key zelf — dus het argument "UUID's zijn beter voor
  gedistribueerde inserts" is hier niet doorslaggevend.
- **Write-hotspots zijn bij dit schrijfvolume geen praktisch risico.** TiDB
  clustert een enkelvoudige integer primary key standaard; bij een zeer
  hoog aantal gelijktijdige inserts per seconde kan een puur sequentiële
  `AUTO_INCREMENT`-sleutel in theorie tot een "hotspot" op één Region
  leiden (TiDB's eigen documentatie noemt `AUTO_RANDOM` als alternatief
  voor dat scenario). Dit project ontvangt echter hooguit één meting per
  ~60 seconden van één (of een handvol) weerstations — een schrijffrequentie
  van enkele honderden inserts per dag, geen duizenden per seconde. Dat
  risico is hier dus verwaarloosbaar. Mocht dit project ooit uitgroeien
  naar duizenden stations met sub-seconde telemetrie, dan is `AUTO_RANDOM`
  een eenvoudige latere aanpassing.
- **Leesbaar en makkelijk te debuggen.** Oplopende, herkenbare ID's zijn in
  logs, foutmeldingen en handmatige SQL-queries prettiger te lezen dan
  UUID's.
- Dezelfde strategie wordt consistent op alle tabellen toegepast.

## 9. Indexering

Met het oog op miljoenen metingen op termijn:

| Tabel                     | Index                                          | Doel                                             |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `weather_observations`    | `(station_id, measured_at)`                    | Historiequeries per station/periode              |
| `sensor_measurements`     | `(station_id, measured_at)`                    | Historiequeries per station/periode              |
| `sensor_measurements`     | `(sensor_type, metric, measured_at)`           | Queries per sensortype (bv. alle PM2.5-metingen) |
| `raw_weather_packets`     | `(station_id, received_at)`                    | Recente/historische ruwe payloads per station    |
| `raw_weather_packets`     | `(payload_hash)`                               | Snel dubbele payloads herkennen                  |
| `daily_weather_summary`   | unique `(station_id, local_date)`              | Eén rij per station per dag                      |
| `monthly_weather_summary` | unique `(station_id, year, month)`             | Eén rij per station per maand                    |
| `yearly_weather_summary`  | unique `(station_id, year)`                    | Eén rij per station per jaar                     |
| `stations`                | unique `(slug)`, unique `(station_identifier)` | Opzoeken en dubbele stations voorkomen           |
| `app_settings`            | unique `(setting_key)`                         | Eén rij per instelling                           |

## 10. Tijd: alles in UTC, presentatie in lokale tijd

Alle `timestamp`-kolommen worden intern in **UTC** opgeslagen. De
stationstijdzone (`Europe/Amsterdam`) staat als veld op `stations.timezone`
en wordt gebruikt om:

- lokale tijd te tónen in de UI (bv. `/station`, straks dashboards);
- kalenderaggregaties correct te laten aansluiten op de lokale dag/maand/jaar
  (`local_date`, `year`, `month` in de summary-tabellen zijn expliciet
  losse kolommen, niet afgeleid van een UTC-timestamp — zomertijd/wintertijd
  zou anders een dag kunnen laten "verschuiven").

## 11. Database-volume: waarom 60 seconden een goed uitgangspunt is

Aantal metingen per jaar bij verschillende upload-intervallen
(365 dagen; een schrikkeljaar voegt ~0,27% toe):

| Interval             | Metingen per dag | Metingen per jaar |
| -------------------- | ---------------: | ----------------: |
| 8 seconden           |           10.800 |       ≈ 3.942.000 |
| 16 seconden          |            5.400 |       ≈ 1.971.000 |
| 30 seconden          |            2.880 |       ≈ 1.051.200 |
| **60 seconden**      |        **1.440** |     **≈ 525.600** |
| 300 seconden (5 min) |              288 |         ≈ 105.120 |

_(Berekening: seconden per jaar ÷ interval, met 86.400 seconden per dag.)_

**60 seconden** is het uitgangspunt (`expected_upload_interval_seconds` op
het seed-station) omdat:

- het het gebruikelijke standaardinterval is waarmee Ecowitt-compatibele
  consoles (zoals de WS5500) data aanleveren aan cloud-diensten;
  gedetailleerd genoeg is voor zinvolle grafieken zonder onnodig veel
  ruwe datapunten;
- ~525.600 rijen per jaar per tabel bij dit schrijfvolume triviaal blijft
  voor TiDB — zelfs na 10 jaar (~5,3 miljoen rijen) presteren de
  bovenstaande indexen prima;
- het past bij de bescheiden schaal van dit project (één station, geen
  duizenden clients): 1 request per minuut is verwaarloosbaar voor zowel
  Vercel's functie-limieten als TiDB Serverless' gratis contingent.

Een kortere interval (bv. 8 seconden) zou het opslagvolume ~7,5× vergroten
zonder navenant voordeel voor een particulier weerstation.

## 12. Toekomstige ingestieflow (nog niet gebouwd in Fase 1)

Voorbereid, maar bewust nog niet gebouwd:

1. Een `POST`-route (bv. `/api/ingest`) ontvangt data van de WS5500
   (rechtstreeks via het Ecowitt-protocol, of via de Ecowitt-cloud-API met
   `ECOWITT_APPLICATION_KEY`/`ECOWITT_API_KEY`/`ECOWITT_DEVICE_MAC`).
2. De route valideert een geheime `WEATHER_INGEST_SECRET` (voorbereid in
   `.env.example`, nog niet gebruikt).
3. De ruwe payload wordt **eerst** ongewijzigd weggeschreven naar
   `raw_weather_packets`.
4. Een parser zet de payload om naar een rij in `weather_observations` (en
   evt. `sensor_measurements`), met eenheidsconversie via
   `src/lib/weather/units.ts` — dit script en zijn tests bestaan al.
5. Een periodieke aggregatiejob vult de summary-tabellen.

`scripts/generate-demo-weather.ts` doorloopt in Fase 1 al precies dit pad
(ruwe payload → genormaliseerde meting) met fictieve data, als oefening
voor deze latere ingestieflow.

## 13. Toekomstige schaalbaarheid

- De scheiding raw/genormaliseerd/samenvattingen laat historiequeries
  straks tegen de (kleine) summary-tabellen draaien in plaats van tegen
  miljoenen ruwe rijen.
- `sensor_measurements` laat nieuwe sensortypes toe zonder schema-
  wijzigingen.
- Bij een sterk gegroeid schrijfvolume (zie §8) is `AUTO_RANDOM` een
  eenvoudige aanpassing voor de high-volume tabellen.
- Er is bewust nog **geen** Redis, message queue, microservice-opsplitsing,
  WebSockets, cronjobs, externe analytics of object storage toegevoegd —
  dat zou premature complexiteit zijn voor de huidige schaal (zie ook
  punt 43 van de projectinstructies).
