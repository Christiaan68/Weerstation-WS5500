# Meerdere weerstations (Fase 5)

Dit document beschrijft de multi-station-architectuur: hoe meerdere
Ecowitt-compatibele weerstations (bv. een Alecto WS5500 in de achtertuin
plus een Ecowitt WS90 bij een vakantiehuis) naast elkaar in dezelfde
applicatie kunnen draaien, elk met hun eigen dashboard, historie,
statistieken en instellingen — zonder dat data van het ene station ooit bij
het andere terechtkomt.

**Status:** Fase 5.1 (dit document) legt het **fundament**: het datamodel,
de stationherkenning, de tijdzone-per-station-logica, de
Ecowitt-cloudkoppeling voor meerdere apparaten, en het `station`-
queryparameter op alle pagina's/API's. Bestaande productie (het huidige
Alecto WS5500-station) blijft hierdoor **ongewijzigd werken** — er is nog
géén zichtbare stationselector in de UI. Die komt in **Fase 5.2**
(stationselector, `/admin/stations`-beheerscherm, onboarding met
verbindingstest, capability-bewuste UI-kaarten). Fase 5.3 volgt met het
volledige testmatrix-, documentatie- en productierapport.

## Alleen Ecowitt-compatibele stations

Deze multi-station-ondersteuning is bewust beperkt tot stations die via de
**Ecowitt Cloud API** (`api.ecowitt.net`) bevraagd kunnen worden — hetzelfde
mechanisme dat het bestaande WS5500-station al gebruikt (zie
[`WS5500_INGESTION.md`](WS5500_INGESTION.md)). Dat is elk Ecowitt-apparaat
zelf, én de vele merken die Ecowitt-compatibele firmware/protocollen
gebruiken (bv. Alecto, Froggit, Misol — voor zover ze bij hetzelfde
Ecowitt-account of -netwerk geregistreerd kunnen worden). Andere merken/
protocollen (Netatmo, WeatherFlow Tempest, KNMI, ...) vallen expliciet
**buiten** deze fase.

## Menselijke naam versus technische identiteit

Elk station heeft twee, bewust gescheiden, identiteiten:

| Veld                              | Rol                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `displayName`                      | De naam die de gebruiker kiest en overal in de UI ziet, bv. "Achtertuin".               |
| `slug`                             | URL-veilige, stabiele identifier voor `?station=`-links — bevat NOOIT een geheim/MAC.   |
| `stationIdentifier`, `macAddress`  | Technische identiteit: koppelt binnenkomende Ecowitt-data aan het juiste station.        |
| `manufacturer`, `model`            | Bv. "Alecto" / "WS5500" — informatief, secundair in de UI.                              |
| `provider`                         | Op dit moment altijd `"ecowitt_cloud"`.                                                 |

Code verwijst intern **altijd** naar een station via zijn onveranderlijke
`id` (of de `slug`) — nooit via `displayName`. Zo breekt het hernoemen van
een station (bv. "Mijn WS5500" → "Achtertuin") nooit een bestaande
historie-link, export of favoriet.

## Stationresolutie: `getStation(slugOrId?)`

Elke pagina en elk API-endpoint bepaalt welk station getoond wordt via één
centrale functie, `getStation()` in `src/lib/db/queries.ts`:

1. Met een waarde (`?station=achtertuin` of `?station=3`): zoekt eerst op
   `slug`, of — als de waarde volledig numeriek is — op `id`.
2. Zonder waarde: het station met `isDefault = true` (er is er precies één,
   afgedwongen door `setDefaultStation()`), en als dat er onverhoopt niet
   is, het oudste actieve station als vangnet.

Dit betekent dat een pagina zonder `?station=`-parameter (bv. de bestaande
`/dashboard`-link) altijd hetzelfde gedrag blijft vertonen als vóór Fase 5:
het (huidige) default-station verschijnt gewoon, zonder dat de gebruiker
iets hoeft te doen.

## Waar `station` als queryparameter werkt

Alle publieke pagina's en API's zijn multi-station-bewust via een
`?station=<slug-of-id>`-parameter:

- Pagina's: `/dashboard`, `/grafieken`, `/regen`, `/wind`, `/records`,
  `/data`, `/data-quality`, `/station`, `/station/diagnostics`.
- API's: `/api/weather/current`, `/history`, `/rain`, `/wind`, `/records`,
  `/summary/daily`, `/summary/monthly`, `/summary/yearly`, `/observations`,
  `/observations/[id]`, `/data-quality`, `/data-quality/missing-intervals`,
  `/station/status`, `/export/csv`, `/export/json`, `/export/raw-packets`.

Zonder de parameter valt elke route terug op het default-station — exact
het gedrag van vóór Fase 5. Alle onderliggende databasequery's filteren
expliciet op `station_id`: er is geen enkel pad waarop data van twee
stations vermengd kan raken (zie `tests/weather-multi-station-isolation.test.ts`
en `tests/weather-ingest-pipeline.test.ts` voor de bijbehorende
isolatietests).

## Tijdzone per station

Elk station heeft zijn eigen `timezone` (IANA-notatie, bv.
`Europe/Amsterdam` of `Europe/Madrid`). Alle lokale-kalendergrenzen (welke
UTC-tijdstippen "vandaag", "deze maand", "dit jaar" zijn voor dát station)
worden berekend met déze tijdzone — nooit een globale aanname. Dit raakt:

- regen-/records-/windroos-overzichten (`rain-service.ts`, `records.ts`,
  `wind-service.ts`);
- dag/maand/jaar-samenvattingen (`summary-service.ts`) — inclusief de
  incrementele herberekening bij elke nieuwe meting
  (`ingest-pipeline.ts`);
- CSV-/JSON-/raw-packet-exports (`export/filters.ts`).

De database blijft, ongeacht het aantal stations of hun tijdzones, altijd
UTC opslaan (`measured_at`, `received_at`, ...) — alleen de presentatie-
/aggregatiegrens verschuift per station. Zie ook
[`DATA_AGGREGATION.md`](DATA_AGGREGATION.md) voor de onderliggende
zomer-/wintertijd-logica, die ongewijzigd is — nu alleen aanroepbaar met een
willekeurige tijdzone in plaats van de vaste standaardwaarde.

## Capability-laag: niet elk station heeft dezelfde sensoren

Niet elk Ecowitt-compatibel station heeft dezelfde sensoruitrusting (bv.
geen bliksemdetector, geen bodemvochtsensor). `src/lib/weather/
capabilities.ts` bepaalt per station, puur op basis van daadwerkelijk
ontvangen data (nooit een aanname per model):

- basissensoren (temperatuur, wind, regen, UV, zon, luchtdruk): afgeleid
  uit de meest recente meting — een `null`-veld betekent "niet aanwezig",
  nooit verzonnen als "0";
- extra sensoren (bliksem, bodemvocht, bladvocht, luchtkwaliteit,
  waterlek, en overige kanalen): afgeleid uit de reeds ontvangen
  `sensor_measurements`-types voor dat station.

`getStationCapabilities(stationId)` combineert beide in één
`StationCapabilities`-object, klaar voor de capability-bewuste UI van Fase
5.2 (een kaart tonen als "—"/"Niet beschikbaar" in plaats van een
foutmelding of gok).

## Ecowitt Cloud-koppeling voor meerdere apparaten

`EcowittCloudProvider` (in `src/lib/weather/providers/ecowitt-cloud.ts`) is
één providerklasse die **meerdere** geregistreerde Ecowitt-apparaten kan
bedienen: `fetchCurrent(deviceMac)` accepteert het MAC-adres van het
BETREFFENDE station. `ECOWITT_APPLICATION_KEY`/`ECOWITT_API_KEY` blijven
gedeelde, account-brede environment-variabelen — er wordt niet
aangenomen dat elk station eigen API-sleutels nodig heeft (dat kan een
latere fase alsnog toevoegen indien nodig).

`pollAllActiveEcowittStations()` bevraagt in één aanroep alle actieve,
aan Ecowitt Cloud gekoppelde stations (elk met een ingesteld MAC-adres):

- **begrensde gelijktijdigheid** (hooguit 3 stations tegelijk) — voorkomt
  het overschrijden van Ecowitt-rate-limits en de Vercel-functietijd;
- **foutisolatie per station** — een mislukte poll voor station B laat
  station A's poll volledig ongemoeid (zie
  `tests/weather-ecowitt-cloud-poll.test.ts`);
- een samenvatting zonder geheimen: aantal actieve stations, geslaagd,
  mislukt, duplicaat/geen-nieuwe-data.

De bestaande beveiligde cron-route,
`/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>`, roept deze
functie nu aan — er is dus nog steeds maar **één** cron-aanroep nodig, ook
bij meerdere stations (zie [`AUTOMATIC_INGESTION.md`](AUTOMATIC_INGESTION.md)).

## Deduplicatie per station

Twee verschillende stations kunnen toevallig (bijna) identieke payloads
binnenkrijgen (bv. twee vergelijkbare stations die op hetzelfde moment
soortgelijke waarden melden). De duplicaatcontrole
(`findDuplicateRawPacket()`) is en blijft samengesteld op `(station_id,
payload_hash)` — nooit alleen op de payload-inhoud — met een nieuwe
index (`raw_packets_station_payload_hash_idx`, migratie 0003) die dit ook
bij veel stations/pakketten snel houdt.

## Stationbeheer (database-niveau, Fase 5.1)

`src/lib/db/queries.ts` bevat de volledige CRUD voor stations, al bruikbaar
via scripts/toekomstige admin-UI:

- `getStations(options?)` — alle (optioneel ook inactieve) stations;
- `getStationById(id)` / `getStation(slugOrId?)`;
- `createStation(input)` — nieuw station aanmaken (nooit hardcoded in
  broncode: altijd via de database);
- `updateStation(id, patch)` — naam, locatieomschrijving, tijdzone,
  pollinterval, actief/inactief, technische identifiers bijwerken;
- `setDefaultStation(id)` — transactioneel: exact één station is ooit
  default.

Er is bewust géén hard-delete-functie: een station met historische data
wordt gedeactiveerd (`isActive = false`), nooit verwijderd. De
Fase 5.2-UI (`/admin/stations`) bouwt bovenop precies deze functies — er is
geen aparte databaselaag nodig.

## Bestaande WS5500 blijft ongewijzigd

Migratie `0003_fase5_multi_station_foundation.sql`:

1. hernoemt `stations.name` naar `stations.display_name` (waarde blijft
   ongewijzigd — puur een kolomnaam, geen dataverlies);
2. voegt `provider`, `firmware_version`, `location_description`,
   `is_default` toe (allemaal met een veilige default of `NULL`);
3. maakt het bestaande (eerst aangemaakte) station het default-station,
   zodat elke pagina/API zonder `?station=`-parameter precies hetzelfde
   WS5500-station blijft tonen als vóór Fase 5;
4. voegt de dedup-index en een unieke index op `mac_address` toe (`NULL`
   blijft toegestaan voor meerdere stations zonder ingesteld MAC-adres).

Geen enkele bestaande rij wordt verwijderd of overschreven met verzonnen
waarden.

## Wat nog volgt (Fase 5.2/5.3)

- Stationselector in de UI (desktop + mobiel), passend bij het bestaande
  atmosferische ontwerp.
- `/admin/stations` — beveiligd beheerscherm: stations toevoegen (incl.
  "verbinding testen": welke sensoren meldt het apparaat daadwerkelijk),
  bewerken, activeren/deactiveren, default instellen.
- Capability-bewuste kaarten/dashboards (gebruikt de al gebouwde
  capability-laag hierboven).
- Volledig testmatrix, productie-uitrol met het bestaande WS5500 als enige
  station, en het Fase 5-eindrapport.

## Problemen oplossen

| Symptoom                                             | Waarschijnlijke oorzaak                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `?station=xyz` geeft 404 ("Geen (actief) weerstation") | De slug/id bestaat niet, of het station staat op inactief.                                                  |
| Een nieuw station wordt nooit gepolld                 | Controleer `provider = "ecowitt_cloud"`, `mac_address` ingesteld, en `is_active = true` op dat stationrecord. |
| Twee stations lijken data te delen                    | Zou niet moeten kunnen — elke query filtert op `station_id`; meld dit als bug (zie de isolatietests).        |
| Verkeerde "vandaag"-grens voor een station             | Controleer `stations.timezone` (IANA-notatie, bv. `Europe/Madrid`) voor dát specifieke station.              |
