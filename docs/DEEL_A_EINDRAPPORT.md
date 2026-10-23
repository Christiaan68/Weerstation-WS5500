# Deel A — Fase 3 productie-afronding: eindrapport

**Status: volledig afgerond en geverifieerd in productie.** Opgeleverd op
2026-09-06. Dit rapport dekt exact de opdracht "Begin nu met DEEL A" —
alle onderdelen zijn hieronder met hun concrete verificatie opgenomen.

## 1. Bestands- en gitstatus geverifieerd
- Volledige Fase 2 + Fase 3-codebase (was nog nooit gecommit) plus alle
  productiefixes uit deze sessie zijn gecommit en gepusht naar
  `https://github.com/Christiaan68/Weerstation-WS5500.git`, branch `main`.
- Commits: `01d5478` (initiële Fase 2+3-commit, 76 bestanden) en `df38d96`
  (fix ONLY_FULL_GROUP_BY, zie §4).
- `.env.local` staat correct in `.gitignore` — geen geheimen gecommit.

## 2. Beide bekende Fase 3-bugfixes bevestigd aanwezig
- **Databaseverbindingspool** (`src/lib/db/index.ts`): cachet de `mysql2`-pool
  altijd via `globalThis`, ongeacht `NODE_ENV` — bevestigd aanwezig in de
  gecommitte/gedeployde code.
- **Veldnaam-mismatch dashboard/history-API** (`history-chart-card.tsx` leest
  `data.metrics`): bevestigd aanwezig.

## 3. Nieuw ontdekte en gefixte bug tijdens deze sessie: mysql2-tijdzone
`src/lib/db/index.ts` miste `timezone: "Z"` in de mysql2-poolconfiguratie.
Zonder deze instelling serialiseert mysql2 JS-`Date`-parameters op basis van
de **lokale tijdzone van het proces** in plaats van UTC. Op Vercel (UTC) viel
dit niet op, maar bij rechtstreeks vanaf de computer van de gebruiker
gedraaide scripts (Europe/Amsterdam, UTC+2) leidde dit tot een structurele
verschuiving van enkele uren in elke tijdstempel-vergelijking. Concreet
bewezen met `scripts/diag-repair-query.ts`: een cutoff van 14:10:00 UTC gaf
ten onrechte ook pakket #60001 (14:13:14 UTC, dus ná de cutoff) terug.
**Fix**: `timezone: "Z"` toegevoegd. Geverifieerd door de gebruiker: na de fix
gaf hetzelfde diagnosescript het correcte resultaat (#30001 i.p.v. #60001).

## 4. Nieuw ontdekte en gefixte bug tijdens de productie-smoketest: ONLY_FULL_GROUP_BY
Tijdens de productie-smoketest (zie §8) faalde de Regen-pagina (tabblad
"Vandaag") structureel met een 503, en trof dezelfde oorzaak incidenteel ook
de Grafieken-pagina bij periodes langer dan 24 uur (7/30/90 dagen, 1 jaar,
alles).

**Oorzaak**: `getHourlyMaxRainDay` en `getObservationSeries`
(`src/lib/db/queries.ts`) groeperen op een berekende tijdbucket-expressie
(`floor(timestampdiff(...))`). Drizzle rendert dezelfde kolomverwijzing
verschillend per SQL-clausule: in de SELECT-lijst zonder tabelnaam
(`measured_at`), maar in GROUP BY/ORDER BY mét tabelnaam
(`weather_observations`.`measured_at`). Voor TiDB's `sql_mode=
ONLY_FULL_GROUP_BY`-validatie zijn dit twee tekstueel verschillende
expressies, wat de query liet falen met `ER_WRONG_FIELD_WITH_GROUP` (code
1055). Reproduceerbaar bevestigd tegen de productiedatabase via het
alleen-lezende `scripts/diag-rain-today.ts`.

**Fix**: de bucket-expressie krijgt nu een SQL-alias (`hour_index` /
`bucket_index`); GROUP BY en ORDER BY verwijzen naar die alias in plaats van
de expressie te herhalen — een door MySQL/TiDB expliciet ondersteund,
ondubbelzinnig patroon, onafhankelijk van hoe Drizzle kolomverwijzingen per
clausule rendert.

**Verificatie**:
- Lokaal: TypeScript-typecheck schoon, volledige testsuite (194 tests)
  slaagt, en de gegenereerde SQL (zonder databaseverbinding gecontroleerd)
  toont consequent dezelfde alias in SELECT én GROUP BY/ORDER BY.
- Tegen productiedatabase (`diag-rain-today.ts`, door de gebruiker
  uitgevoerd): `period=today` geeft nu een geldig resultaat i.p.v. de
  foutmelding.
- In productie (na deploy `df38d96`): Regen-pagina (Vandaag) en
  Grafieken-pagina (24 uur/7 dagen/1 jaar, incl. UV & zon) rechtstreeks
  getest — alle 200 OK, geen consolefouten, Vercel-logs 0 fouten sindsdien.
- Commit + push: `df38d96`, automatisch gedeployed naar productie, status
  "Ready".

## 5. Migratie 0002 toegepast en geverifieerd
`0002_fase3_records_indexes.sql` (6 samengestelde indexen op
`weather_observations` t.b.v. records-queries) is toegepast op de
productiedatabase en bevestigd aanwezig.

## 6. Summary-backfill uitgevoerd en geverifieerd
`npm run weather:recompute-summaries -- --all` is tegen productie gedraaid.
Geverifieerd met het alleen-lezende `scripts/diag-check-summaries.ts`:
dag/maand/jaarsamenvattingen tonen plausibele waarden (bv. 2026-09-05:
19,2–19,7°C, 0 mm regen, wind max 5,5 km/u).

## 7. temp_unitid-bug: onderzocht, veilig hersteld en geverifieerd
De Ecowitt Cloud API gaf oorspronkelijk `temp_unitid=1` (feitelijk °C) door,
terwijl de app dit als °F interpreteerde. Een eerste herstelpoging
(`weather:repair-temp-unitid:confirm`) bleek een **no-op**: die functie
herverwerkt de opgeslagen ruwe payload via de ongewijzigde parser, die voor
deze oude pakketten de temperatuurvelden (al in werkelijkheid °C, maar
opgeslagen onder Fahrenheit-veldnamen) opnieuw F→C converteerde — een
tweede, foutieve conversie die het probleem niet oploste.

**Fix**: `reprocessRawPacket()` kreeg een optionele `rawPayloadOverride`-
parameter; nieuw script `scripts/repair-temp-unitid-values.ts` bouwt een
gecorrigeerde kopie van de payload (via de "fake Fahrenheit"-truc:
`fakeF = trueC × 9/5 + 32`, zodat de bestaande, geteste F→C-conversie het
juiste resultaat geeft) en voert die door de bestaande pijplijn, zonder de
opgeslagen ruwe data aan te passen.

**Verificatie** (met expliciete toestemming per pakket, dry-run eerst): het
ene getroffen pakket toonde ná reparatie plausibele waarden (buiten 19,2°C,
binnen 21,8°C, dauwpunt 13,6°C, gevoelstemperatuur 19,2°C) — "1 gevonden, 1
succesvol herverwerkt, 0 mislukt".

## 8. Demo-data: geïnventariseerd en met toestemming opgeruimd
Met expliciete toestemming van de gebruiker verwijderd: 288 ruwe pakketten
en metingen uit de demo-periode (4 sep 01:13 – 5 sep 01:08). Productie
draait sindsdien uitsluitend op echte WS5500-data.

## 9. Demo mode uitgezet in productie
`NEXT_PUBLIC_DEMO_MODE=false` in Vercel (na een omweg: de variabele stond
per ongeluk als type "Secret", een combinatie die Vercel niet toestaat voor
een `NEXT_PUBLIC_`-variabele — opgelost door 'm opnieuw aan te maken als
"Plain/Config"). Geverifieerd: geen "Demo-gegevens"-badge meer op het
dashboard in productie.

## 10. Automatische Ecowitt Cloud-polling: ingesteld en geverifieerd
cron-job.org, elke 5 minuten, roept
`/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>` aan (zie
`docs/AUTOMATIC_INGESTION.md`). Onderweg is het secret één keer gelekt via
een cron-job.org-schermafbeelding en volledig geroteerd (Vercel,
`.env.local`, cron-job.org, herdeploy) — zonder dat het secret ooit door de
chat is gegaan. Geverifieerd: `/station` toont **Cronjob-status: Actief**,
12+ opeenvolgende geslaagde aanroepen in cron-job.org's geschiedenis, en
`GET` op de route retourneert consequent `{"ok":true,"status":"...",
"packetId":...}`.

## 11. Productie-smoketest — alle pagina's, console en serverlogs
Rechtstreeks getest op `https://weerstation-ws-5500.vercel.app` (niet
localhost), inclusief browserconsole, netwerkverzoeken en Vercel-serverlogs:

| Pagina | Resultaat |
| --- | --- |
| Dashboard | OK — echte data, 24-uursgrafiek, geen consolefouten |
| Grafieken | OK — alle periodes (24u/7d/30d/90d/1jaar/alles) en categorieën |
| Regen | OK — alle tabbladen (incl. "Vandaag", ná fix uit §4) |
| Wind | OK — windroos + cijfers |
| Records | OK — incl. correcte lege-staat bij ontbrekende regenintensiteit |
| Historie | OK — filters en paginering |
| Station | OK — cronjob-status "Actief", dekkingscijfer |

**Vercel-serverlogs** (laatste 24 uur na de fix): 0 fouten, 0 waarschuwingen.
Vóór de fix: uitsluitend de in §4 beschreven `ER_WRONG_FIELD_WITH_GROUP`-
fouten — geen enkele fout gerelateerd aan connectiepool-uitputting, TLS of
timeouts. De pool-fix (§2) is dus aantoonbaar stabiel onder productieverkeer.

## Openstaande aandachtspunten (geen blokkers voor Deel A)
- Het "Aangemaakt op"-veld op de Stationpagina toont de datum van vandaag
  (in plaats van de oorspronkelijke installatiedatum) — vermoedelijk een
  bijeffect van de demo-data-opruiming die het stationsrecord raakte. Puur
  cosmetisch, geen functionele impact; kan in Deel B meegenomen worden als
  gewenst.
- Eén incidentele `<svg> attribute height: Expected length, "auto".`-
  waarschuwing in de browserconsole (windroos/grafiek-rendering tijdens het
  allereerste laadmoment). Niet-blokkerend, geen zichtbaar effect, geen
  Vercel-serverfout.

## Conclusie
Alle onderdelen van Deel A (Fase 3 productie-afronding) zijn afgerond en
met concrete controles geverifieerd: code, database, automatische ingestie,
demo-opruiming en productiedeployment. Twee nieuwe bugs zijn tijdens deze
afronding ontdekt (mysql2-tijdzone; ONLY_FULL_GROUP_BY) en beide zijn
gefixt, getest en in productie geverifieerd. Er zijn geen bekende
openstaande fouten. Deel B (Fase 4) kan starten.
