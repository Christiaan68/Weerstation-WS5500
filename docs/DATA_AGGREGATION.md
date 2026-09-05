# Data-aggregatie en statistieken — Fase 3

Dit document beschrijft de rekenlogica achter het live dashboard, de
grafieken, regen-, wind- en recordspagina's, en de dag/maand/jaar-
samenvattingen. Het complement bij [`docs/WS5500_INGESTION.md`](WS5500_INGESTION.md)
(hoe data binnenkomt) en [`docs/AUTOMATIC_INGESTION.md`](AUTOMATIC_INGESTION.md)
(hoe dat automatisch gebeurt) — dit document gaat over wat er ná ingestie met
de data gebeurt.

## Inhoud

- [1. Datamodel-principe: summary-tabellen voor dashboardquery's](#1-datamodel-principe-summary-tabellen-voor-dashboardquerys)
- [2. Lokale kalenderdagen: Europe/Amsterdam, DST-bewust](#2-lokale-kalenderdagen-europeamsterdam-dst-bewust)
- [3. Dag/maand/jaar-samenvattingen: hoe en wanneer ze gevuld worden](#3-dagmaandjaar-samenvattingen-hoe-en-wanneer-ze-gevuld-worden)
- [4. Downsampling voor grafieken](#4-downsampling-voor-grafieken)
- [5. Regen: cumulatieve tellers vs. instantane snelheid](#5-regen-cumulatieve-tellers-vs-instantane-snelheid)
- [6. Windroos](#6-windroos)
- [7. Records: SQL-side extremen](#7-records-sql-side-extremen)
- [8. Trends](#8-trends)

## 1. Datamodel-principe: summary-tabellen voor dashboardquery's

`weather_observations` groeit met elke poll (zie
[`docs/AUTOMATIC_INGESTION.md`](AUTOMATIC_INGESTION.md), elke 5 minuten =
~105.000 rijen/jaar). Elke pagina die een periode langer dan een paar dagen
toont (maandoverzicht, jaaroverzicht, records) leest daarom **nooit**
rechtstreeks een volledige periode uit `weather_observations` in de
toepassingslaag in te lezen om zelf op te tellen/te middelen. In plaats
daarvan:

| Tabel/bron                | Gebruikt voor                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `weather_observations`    | Live dashboard (laatste meting), 24-uursgrafiek, "vandaag"-cijfers, records (met index-ondersteunde `ORDER BY ... LIMIT 1`-queries, zie §7), de `/historie`-data-explorer (waar individuele metingen tonen letterlijk de functie van de pagina is). |
| `daily_weather_summary`   | Regen per dag (week/maandoverzicht), maandsamenvatting-opbouw.                                                                                                                                                                                      |
| `monthly_weather_summary` | Regen per maand (jaaroverzicht), jaarsamenvatting-opbouw.                                                                                                                                                                                           |
| `yearly_weather_summary`  | All-time-overzichten.                                                                                                                                                                                                                               |
| `raw_weather_packets`     | **Nooit** voor dashboardweergave — alleen voor de beveiligde diagnosepagina (ruwe JSON-payloads, parserstatus).                                                                                                                                     |

## 2. Lokale kalenderdagen: Europe/Amsterdam, DST-bewust

Alles in de database staat in UTC (zie
[`docs/WS5500_INGESTION.md`](WS5500_INGESTION.md) §7). Maar "vandaag",
"deze maand" en "dit jaar" zijn voor een gebruiker in Nederland altijd
**lokale** begrippen — nooit UTC 00:00–23:59.

`src/lib/weather/timezone.ts` implementeert dit zonder externe
tijdzone-library (`date-fns-tz`/`luxon`) via de ingebouwde
`Intl.DateTimeFormat`-API:

- `zonedWallTimeToUtc()` — rekent lokale wandklok-velden om naar het
  bijbehorende UTC-instant, met een 2-iteratie-algoritme (voldoende omdat
  Europe/Amsterdam maar twee vaste offsets kent en de overgang altijd
  's nachts plaatsvindt, nooit rond middernacht).
- `getLocalDayBoundsUtc(localDateKey)` — geeft `{startUtc, endUtc,
durationSeconds}` voor één lokale kalenderdag. `durationSeconds` is
  **niet altijd 86.400**: op de dag van de overgang naar zomertijd (laatste
  zondag van maart) is een lokale dag 23 uur (82.800s), op de overgang naar
  wintertijd (laatste zondag van oktober) 25 uur (90.000s). Dit is expliciet
  getest in `tests/weather-timezone.test.ts` met **dynamisch berekende**
  (niet hardgecodeerde) overgangsdata, zodat de test ook in toekomstige
  jaren geldig blijft.
- Elke functie die "vandaag"/"deze maand"/"dit jaar" nodig heeft
  (`summary-service.ts`, `records.ts`, `rain-service.ts`,
  `wind-service.ts`) gebruikt uitsluitend deze helpers — nooit een losse
  `new Date().setHours(0,0,0,0)`-achtige aanpak (die UTC-middernacht zou
  gebruiken op een server die niet toevallig in de Europe/Amsterdam-
  tijdzone draait, zoals Vercel's functions).

## 3. Dag/maand/jaar-samenvattingen: hoe en wanneer ze gevuld worden

`src/lib/weather/summary.ts` (pure rekenlogica, geen database) +
`src/lib/weather/summary-service.ts` (orchestratie):

- **Dagsamenvatting**: één SQL-aggregatiequery
  (`aggregateObservationsForRange()` in `queries.ts`) over
  `weather_observations` binnen de UTC-grenzen van die ene lokale dag —
  `MIN`/`MAX`/`AVG`/`COUNT`, database-side. Regen: `MAX(rain_day_mm)` (zie
  §5). `expectedObservationCount` = dagduur in seconden ÷ pollinterval
  (300s, zie AUTOMATIC_INGESTION.md) — dus automatisch lager op een
  23-uursdag, hoger op een 25-uursdag. `coveragePct` = geobserveerd ÷
  verwacht × 100, begrensd op 100%.
- **Maandsamenvatting**: **niet** opnieuw een scan van
  `weather_observations` voor de hele maand — afgeleid uit de al opgeslagen
  dagsamenvattingen van die maand (`combineSummaryAggregates()`):
  - min/max: het min/max van de kind-dagen se min/max.
  - gemiddelden: **gewogen** gemiddelde (gewogen naar `observationCount`
    per dag) — een dag met een gedeeltelijke storing weegt minder zwaar
    mee dan een volledige dag.
  - regen: **som** van de dagtotalen (nooit een nieuwe tellerberekening).
  - pieken (windstoten, regenintensiteit, UV, zoninstraling): max van de
    kind-max.
- **Jaarsamenvatting**: dezelfde `combineSummaryAggregates()`, toegepast op
  de maandsamenvattingen van dat jaar.
- **Wanneer dit draait**:
  - **Incrementeel**: na elke succesvol opgeslagen meting herberekent
    `ingest-pipeline.ts` (best-effort, in een `try/catch`, blokkeert de
    ingestie nooit) de dag/maand/jaar van die ene meting
    (`recomputeSummariesForInstant()`). Zo blijft "vandaag" continu actueel
    zonder een aparte achtergrondtaak.
  - **Backfill/reparatie**: `npm run weather:recompute-summaries` (zie
    §"Scripts" in het eindrapport) herberekent een reeks dagen plus alle
    geraakte maanden/jaren — gebruikt na een reparatiescript
    (`weather:repair-temp-unitid`) dat oude metingen wijzigt, of om
    historische data met terugwerkende kracht samen te vatten.

## 4. Downsampling voor grafieken

`src/lib/weather/downsampling.ts`, gebruikt door
`GET /api/weather/history` (`/grafieken`, dashboard-24u-grafiek):

Uitgangspunt (tabel uit de opdracht):

| Bereik      | Resolutie |
| ----------- | --------- |
| 0–48 uur    | Ruw       |
| 2–14 dagen  | 5 minuten |
| 14–90 dagen | Uur       |
| > 90 dagen  | Dag       |

Deze tabel botst met de eigen harde eis van maximaal ~500-1.500 punten per
serie: 14 dagen op 5-minutenresolutie is 4.032 punten. `chooseAggregationInterval()`
lost dit op met een tweetraps-algoritme: **(1)** kies de tier uit de tabel,
**(2)** schaal zo nodig af naar een grovere resolutie totdat de geschatte
puntenaantal binnen het budget (standaard 1.500) past. Bij het huidige
pollinterval (5 minuten) betekent dit in de praktijk: 5-minutenresolutie tot
~5 dagen, daarna uurresolutie tot 90 dagen. Zie de uitgebreide toelichting
bovenaan `downsampling.ts` en `tests/weather-downsampling.test.ts`.

De daadwerkelijke aggregatie gebeurt **in SQL** (`getObservationSeries()` in
`queries.ts`): `floor(timestampdiff(second, from, measured_at) /
intervalSeconds)` als bucket-index, gegroepeerd, met per metric `AVG` (bv.
temperatuur, luchtdruk, windsnelheid) of `MAX` (windstoten, regenintensiteit,
UV, zoninstraling — waar een piek interessanter is dan een gemiddelde). Nooit
alle ruwe metingen naar de applicatie halen om daar samen te vatten.

## 5. Regen: cumulatieve tellers vs. instantane snelheid

Zie de uitgebreide toelichting bovenaan `src/lib/weather/rain.ts`. Kern:

- Het Ecowitt-protocol levert regen als **cumulatieve tellers**
  (`rainDayMm` telt op vanaf 0 bij lokale middernacht) plus één **instantane
  snelheid** (`rainRateMmH`). Deze mogen nooit als één lijn behandeld worden.
- **Fout** (het klassieke probleem uit de opdracht): metingen bij elkaar
  optellen. Tellerstanden 2.0 → 2.2 → 2.5 zouden dan 6.7mm opleveren.
- **Correct**: "regen op dag D" = het **maximum** van `rainDayMm` binnen die
  dag (de teller is binnen één dag monotoon stijgend, dus het maximum = de
  laatste stand = het dagtotaal). Zie `dailyRainTotalMm()`.
- "Regen deze week/maand/jaar" = **som van de dagtotalen** over de eigen
  Europe/Amsterdam-kalenderperiode (nooit de eigen week/maand/jaar-teller
  van het station zelf, die volgt mogelijk een andere resetklok). Zie
  `sumDailyTotals()`.
- Staafgrafieken (regen per uur/dag) = het **verschil** tussen opeenvolgende
  bucket-maxima (`incrementsFromCumulativeSeries()`), met reset-detectie:
  een onverwachte daling (teller-reset, nieuwe dag) levert nooit een
  negatief increment op — de nieuwe waarde zelf wordt dan het increment.
- Regendag-drempel: **0,1 mm** (`DEFAULT_RAIN_DAY_THRESHOLD_MM`),
  configureerbaar via de `thresholdMm`-parameter van `isRainDay()`.

## 6. Windroos

`src/lib/weather/wind.ts` + `wind-service.ts`. 16 Nederlandse
kompasrichtingen (hergebruikt uit `src/lib/weather/units.ts`, Fase 1/2 — niet
gedupliceerd). Windstil-drempel: **1 km/h** (Beaufort windkracht 0), een
gangbare meteorologische ondergrens — metingen onder deze snelheid worden
apart geteld (`calmCount`), niet aan een richting toegekend (bij zeer lage
snelheid is de momentane richting grotendeels sensorruis).

Windrichting is fundamenteel niet zinvol vooraf te aggregeren (het
gemiddelde van 350° en 10° is geen 180°), dus de windroos wordt in de
toepassingslaag opgebouwd uit individuele metingen — bewust **begrensd tot
maximaal 30 dagen** (`WIND_ROSE_PERIODS` in `wind-service.ts`) zodat dit
altijd een begrensde, snelle query blijft (bij 5 minuten pollinterval
maximaal ~8.640 rijen, met een harde `limit` als vangnet).

## 7. Records: SQL-side extremen

Sectie-eis: **nooit** `Math.max()` over een volledig in-memory dataset.
`getWeatherRecords()` in `queries.ts` doet voor elke metric (temperatuur,
windstoten, windsnelheid, regenintensiteit, luchtdruk, luchtvochtigheid,
elk min én max) een aparte `ORDER BY <kolom> DESC/ASC LIMIT 1`-query,
optioneel binnen een periodefilter. Migratie `0002_fase3_records_indexes.sql`
voegt samengestelde indexen (`station_id`, `<kolom>`) toe zodat TiDB deze
sortering via de index kan doen in plaats van een volledige tabelscan.
`src/lib/weather/records.ts` koppelt dit aan de vier periodes (vandaag, deze
maand, dit jaar, all-time) via de lokale-kalendergrenzen uit §2.

## 8. Trends

`src/lib/weather/trends.ts`: `computeWindowTrend()` berekent een trend als
**eerste-vs-laatste-waarde** binnen een tijdvenster (geen volledige lineaire
regressie — voor een korte trendindicator op het dashboard is dat onnodig
complex), genormaliseerd naar per uur. Geeft `null` terug (nooit een
verzonnen trend) bij minder dan 2 punten of een te korte tijdspanne
(`minSpanMinutes`, standaard de helft van het venster). Luchtdruktrend:
`classifyPressureTrend()` met een **zelf gekozen, gedocumenteerde** drempel
van 1,0 hPa/3u (niet een officiële meteorologische standaard) — stijgend
boven +1,0, dalend onder -1,0, anders stabiel.
