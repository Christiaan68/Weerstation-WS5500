# Data-export en back-up (Fase 4)

Dit document beschrijft hoe je de volledige WS5500-dataset kunt exporteren,
onafhankelijk van deze website kunt bewaren, en (indien nodig) kunt
herstellen. Het dekt: CSV-export, JSON/NDJSON-export, de beveiligde
raw-packet-backup, een TiDB-databasebackup, herstelprocedures, en welke
environment variables apart en veilig bewaard moeten worden.

Geen van de onderstaande exports verwijdert of wijzigt data — dit project
heeft bewust GEEN automatisch retentie-/opschoonbeleid (zie §42 van de
Fase 4-opdracht): historische data blijft voor altijd in de database staan
totdat je zelf iets verwijdert.

## 1. Wat wordt waar opgeslagen

| Tabel | Inhoud | Groeit met |
| --- | --- | --- |
| `weather_observations` | Genormaliseerde metingen (temperatuur, wind, regen, ...) | 1 rij per geslaagde poll (~5 min) |
| `raw_weather_packets` | Ongewijzigde, originele Ecowitt-payloads | 1 rij per poll (geslaagd of niet) |
| `sensor_measurements` | Toekomstige extra sensorkanalen (bodemvocht, PM2.5, ...) | Alleen als er extra sensoren worden aangesloten |
| `daily_weather_summary` | Dagsamenvattingen (min/max/gemiddelde, dekking) | 1 rij per dag |
| `monthly_weather_summary` | Maandsamenvattingen | 1 rij per maand |
| `yearly_weather_summary` | Jaarsamenvattingen | 1 rij per jaar |

Zie `/station` (sectie "Dataopslag") voor de actuele rijtellingen, de eerste/
laatste meting, en een (nadrukkelijk als schatting gelabelde) projectie van
de databasegroei over 1/5/10 jaar.

## 2. CSV-export

`GET /api/weather/export/csv`

Query-parameters:

| Parameter | Waarden | Standaard |
| --- | --- | --- |
| `preset` | `vandaag`, `gisteren`, `laatste-7-dagen`, `laatste-30-dagen`, `huidige-maand`, `huidig-jaar`, `aangepast` | `laatste-7-dagen` (of `aangepast` zodra `from`/`to` zijn opgegeven) |
| `from`, `to` | `YYYY-MM-DD` of volledige ISO-datetime — verplicht bij `preset=aangepast` | — |
| `metrics` | Kommagescheiden lijst kolomsleutels (zie hieronder) | alle kolommen |
| `source` | Filter op herkomst, bv. `ecowitt_cloud_api` | geen filter |
| `timezone` | `local` (Europe/Amsterdam) of `utc` — bepaalt hoe een datum-only `from`/`to` geïnterpreteerd wordt | `local` |
| `delimiter` | `comma` of `semicolon` | `comma` |
| `slug` | Stationslug (bij meerdere stations) | het enige actieve station |

Voorbeeld — laatste 30 dagen, Nederlandse Excel-opmaak:

```
GET /api/weather/export/csv?preset=laatste-30-dagen&delimiter=semicolon
```

**Nederlandse Excel-compatibiliteit**: bij `delimiter=semicolon` worden
decimale getallen met een KOMMA geschreven (`19,7` i.p.v. `19.7`) — de
Nederlandse Excel-conventie (lijstscheidingsteken `;`, decimaalteken `,`).
Bij `delimiter=comma` blijft het internationale puntformaat gehandhaafd.
Het bestand begint met een UTF-8 BOM zodat Excel het altijd als UTF-8 opent
(belangrijk voor `°` en `²` in kolomkoppen), en gebruikt CRLF-regeleindes.

**Ontbrekende waarden** worden een LEEG veld, nooit `0` — een sensor die
niets teruggeeft is geen 0-meting.

**Kolommen** (met `metrics` te selecteren; `timestamp_utc`, `timestamp_local`,
`quality_status` en `source` staan altijd in de export):

```
timestamp_utc, timestamp_local, temperature_outdoor_c, temperature_indoor_c,
dew_point_c, feels_like_c, wind_chill_c, heat_index_c, humidity_outdoor_pct,
humidity_indoor_pct, pressure_relative_hpa, pressure_absolute_hpa,
wind_speed_kmh, wind_gust_kmh, wind_direction_deg, wind_direction_compass,
rain_rate_mm_h, rain_event_mm, rain_hour_mm, rain_day_mm, rain_week_mm,
rain_month_mm, rain_year_mm, rain_total_mm, uv_index, solar_radiation_wm2,
quality_status, source
```

`windchill`/`heat_index`/de losse regenperiodes kunnen leeg zijn als het
station die (nog) niet doorstuurt — zie de bekende beperkingen in het
hoofd-README.

## 3. JSON- en NDJSON-export

`GET /api/weather/export/json`

Dezelfde parameters als de CSV-export (geen `delimiter`), plus:

| Parameter | Waarden | Standaard |
| --- | --- | --- |
| `format` | `json` (één array) of `ndjson` (één JSON-object per regel) | `json` |

Gebruik `format=ndjson` voor grotere periodes: elke regel is direct te
verwerken zonder het hele bestand te parsen, en geschikt om regel-voor-regel
te streamen naar een eigen script/database. Ontbrekende waarden zijn `null`.

## 4. Grote exports — streaming en grenzen

Beide exports lezen de database in batches (2000 rijen per keer, oplopend
gesorteerd) en schrijven direct naar de HTTP-respons — er wordt nooit de
volledige export in het geheugen van de server opgebouwd. Er geldt wél een
harde bovengrens van 500.000 rijen per aanroep (raw-packet-backup: 100.000
pakketten): een serverless functie op Vercel heeft een tijdslimiet, en zonder
grens zou een export die te lang duurt zonder duidelijke verklaring afbreken.
Bij het bereiken van de grens eindigt het bestand met een leesbare regel die
dit meldt — kies dan een kortere periode voor de rest van het tijdvak.

Vuistregel: bij het huidige pollritme van 5 minuten (~288 metingen/dag) blijft
zelfs een export van meerdere jaren ruim onder deze grens.

## 5. Raw-packet-backup (beveiligd)

`GET /api/weather/export/raw-packets?key=<STATION_DIAGNOSTICS_SECRET>`

Bevat de VOLLEDIGE, ongewijzigde Ecowitt-payloads (`raw_weather_packets`) —
de meest complete backup, waaruit je in theorie alles zou kunnen herafleiden.
Dit endpoint is NIET publiek: het hergebruikt exact dezelfde sleutel als de
bestaande diagnosepagina's (`STATION_DIAGNOSTICS_SECRET`). Zonder (of met een
foute) `key` geeft de route een gewone 404 terug — dat lekt niet dat het
endpoint bestaat.

Ondersteunt dezelfde `preset`/`from`/`to`/`timezone`-parameters als de andere
exports (geen `metrics`/`delimiter`/`format` — altijd NDJSON, één ruw pakket
per regel). Zie `docs/AUTOMATIC_INGESTION.md` voor waar je de huidige
`STATION_DIAGNOSTICS_SECRET` terugvindt.

## 6. TiDB Cloud — een volledige databasebackup

Voor een backup die volledig onafhankelijk is van deze applicatie (dus ook
bruikbaar als de website zelf niet meer bestaat):

1. **TiDB Cloud-dashboard** → jouw cluster → **Backup** (of **Import/Export**,
   afhankelijk van het clustertype: Serverless heeft een ingebouwde
   backup/export-functie, Dedicated heeft "Backup & Restore"). Volg de
   TiDB Cloud-documentatie voor de exacte stappen voor jouw clustertype —
   dit verandert soms van naam in de Vercel/TiDB-interface.
2. Alternatief, handmatig, vanaf een computer met netwerktoegang tot de
   database (`DATABASE_URL` uit Vercel of `.env.local`): een standaard
   MySQL-compatibele dump, bijvoorbeeld met `mysqldump` of `mydumper` (TiDB
   is MySQL-protocolcompatibel). Bewaar de dump-bestanden niet in de
   Git-repository (ze kunnen persoonsgegevens/meetdata bevatten en worden al
   snel te groot voor Git).
3. Sla de databasebackup op een plek los van zowel Vercel als GitHub op (bv.
   een externe cloudopslag), zodat een probleem bij één van de twee de
   backup niet raakt.

## 7. Herstellen

### Herstellen van de database (TiDB)

Gebruik de TiDB Cloud-restore-functie bij het bijbehorende backuptype, of
speel een `mysqldump`-bestand terug tegen een (nieuw) TiDB-cluster met een
gewone MySQL-client. Ga daarna na dat `npm run db:migrate` geen openstaande
migraties meer toont (het schema van de backup moet overeenkomen met de
migraties in `db/migrations/`).

### Herstellen via GitHub

De broncode zelf staat volledig in de Git-geschiedenis
(`https://github.com/Christiaan68/Weerstation-WS5500`, branch `main`). Een
`git clone` plus de stappen in `README.md` (installeren, `.env.local`
invullen, migreren) bouwt de applicatiecode volledig opnieuw op — dit bevat
GEEN meetdata, alleen code en schema.

### Herstellen via Vercel

Vercel bewaart eerdere deployments (zie de Deployments-lijst in het
Vercel-dashboard). Bij een probleem met de nieuwste deployment kun je via
"Redeploy" of "Promote to Production" op een eerdere, bekend-werkende
deployment terugvallen — dit herstelt alleen de APPLICATIE (code + build),
niet de database-inhoud.

## 8. Welke environment variables apart en veilig bewaard moeten worden

Bewaar deze WAARDEN zelf (niet alleen de namen) op een veilige plek los van
Git — bijvoorbeeld een wachtwoordmanager. Ze staan (zonder hun waarde) ook
opgesomd in `.env.example`.

| Variabele | Waarom apart bewaren |
| --- | --- |
| `DATABASE_URL` | Volledige inloggegevens voor de TiDB-database (host, gebruiker, wachtwoord) |
| `WEATHER_INGEST_SECRET` | Zonder deze sleutel kan niemand (ook het station zelf niet) nieuwe metingen insturen |
| `STATION_DIAGNOSTICS_SECRET` | Geeft toegang tot de diagnosepagina's én de raw-packet-backup-export uit dit document |
| `ECOWITT_APPLICATION_KEY` / `ECOWITT_API_KEY` | Ecowitt Cloud-accountsleutels — bij lekken kan een derde jouw Ecowitt-account uitlezen |
| `ECOWITT_DEVICE_MAC` | Op zichzelf geen geheim, maar hoort bij de combinatie hierboven |

**Nooit doen**: deze waarden in een commit, een screenshot, een issue, of
een chatbericht plakken. Zie ook de eerdere sleutel-rotatie na een
schermafbeelding-lek, gedocumenteerd in `docs/DEEL_A_EINDRAPPORT.md`. Bij
een vermoeden van een lek: roteer de sleutel in Vercel (en, voor
`WEATHER_INGEST_SECRET`, ook in de cron-job.org-configuratie) en herdeploy.

## 9. Aanbevolen back-upritme

Er is geen automatisch back-upschema in deze applicatie ingebouwd (buiten
TiDB Cloud's eigen, platform-side back-ups, indien geconfigureerd). Een
praktisch ritme voor een particuliere installatie:

- **Maandelijks**: een CSV- of NDJSON-export van de afgelopen maand
  wegschrijven naar eigen opslag (`preset=huidige-maand`).
- **Jaarlijks**: een volledige NDJSON-export van het hele jaar
  (`preset=huidig-jaar`) plus, indien gewenst, een raw-packet-backup van
  datzelfde jaar.
- **Bij grote wijzigingen** (reparatiescript, schema-migratie): een verse
  TiDB-databasebackup vóór de wijziging.
