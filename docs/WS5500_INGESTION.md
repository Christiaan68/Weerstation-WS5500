# WS5500-ingestie — Fase 2

Dit document beschrijft de technische keuzes achter Fase 2: het
daadwerkelijk ontvangen, ongewijzigd bewaren, parsen en genormaliseerd
opslaan van data van de Alecto WS5500. Fase 2 bouwt bewust **geen**
grafieken, windroos, regenrapporten of andere eindgebruikersfunctionaliteit
— zie [`README.md`](../README.md#volgende-fases) voor de volledige
scope-afbakening. Het doel van deze fase is uitsluitend: een betrouwbare,
diagnosticeerbare ingestieketen.

## Inhoud

- [1. De kernvraag: kan de WS5500 rechtstreeks naar Vercel uploaden?](#1-de-kernvraag-kan-de-ws5500-rechtstreeks-naar-vercel-uploaden)
- [2. Twee ingestieroutes, één pijplijn](#2-twee-ingestieroutes-één-pijplijn)
- [3. Beveiliging](#3-beveiliging)
- [4. Raw-first: nooit interpreteren vóór opslaan](#4-raw-first-nooit-interpreteren-vóór-opslaan)
- [5. De parser/normalisatielaag](#5-de-parsernormalisatielaag)
- [6. Deduplicatie](#6-deduplicatie)
- [7. Tijd: UTC, defensief geparsed](#7-tijd-utc-defensief-geparsed)
- [8. Verwerkingsstatus van een ruw pakket](#8-verwerkingsstatus-van-een-ruw-pakket)
- [9. Herverwerking na een parser-uitbreiding](#9-herverwerking-na-een-parser-uitbreiding)
- [10. Ecowitt Cloud-polling plannen](#10-ecowitt-cloud-polling-plannen)
- [11. Prestaties en Vercel Functions-limieten](#11-prestaties-en-vercel-functions-limieten)
- [12. Bewust nog niet gebouwd](#12-bewust-nog-niet-gebouwd)
- [13. Onzekerheden die nog verificatie met een echt station vereisen](#13-onzekerheden-die-nog-verificatie-met-een-echt-station-vereisen)

## 1. De kernvraag: kan de WS5500 rechtstreeks naar Vercel uploaden?

**Kort antwoord: niet betrouwbaar, en dat is een eigenschap van het
station, niet van dit project.**

De WS5500 (en de onderliggende WSView Plus-app/Ecowitt-firmware) kan onder
**Apparaatlijst → (station) → Instellingen → Server aanpassen ("Customized")**
data naar een eigen server sturen via het Ecowitt-protocol: een gewone
`HTTP POST` met `application/x-www-form-urlencoded`-velden naar een
zelf-gekozen host/pad/poort. Vercel accepteert echter uitsluitend **HTTPS**
op poort 443 — onversleuteld `HTTP`-verkeer wordt niet doorgelaten.

Uit onderzoek naar de beschikbare documentatie en berichten van andere
gebruikers van Ecowitt/Fine Offset-compatibele stations (waaronder een
GitHub-issue op Home Assistants Ecowitt-integratie en een discussiedraad op
een weerstation-forum) blijkt dat de "Customized server"-upload van deze
apparaten **geen TLS/HTTPS ondersteunt** — het is een kale HTTP-POST,
zonder optie voor een certificaat of `https://`-schema in het serveradres.
Dat is een vaste eigenschap van deze productfamilie, niet iets dat met een
instelling op te lossen is.

**Wat dit voor dit project betekent:**

- Een rechtstreekse WS5500 → Vercel-upload via `/api/weather/ingest/[secret]`
  werkt dus **niet betrouwbaar als hoofdroute** — de route bestaat wél (zie
  §2), voor het geval een toekomstige firmware-update alsnog HTTPS
  ondersteunt, of voor wie zelf een (HTTPS-terminerende) proxy vóór het
  eigen netwerk zet. Dat laatste is echter geen vereiste van dit project.
- **Er is expliciet GEEN lokale always-on bridge (Raspberry Pi, NAS,
  eigen server) toegevoegd** om dit op te lossen — dat zou in strijd zijn
  met de cloud-only-eis van dit project (zie
  [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)).
- De praktische oplossing is dat de WS5500 zijn data **rechtstreeks over
  gewoon HTTP naar Ecowitt's eigen cloud (`ecowitt.net`)** stuurt — dat is
  een aparte, door Ecowitt zelf aangeboden functie ("Ecowitt.net" naast
  "Customized" in de serverinstellingen) — en dat deze applicatie die data
  vervolgens via de **Ecowitt Cloud API** ophaalt met een gewone,
  uitgaande **HTTPS**-aanroep vanuit Vercel. Zie §2 en
  `src/lib/weather/providers/ecowitt-cloud.ts`.

## 2. Twee ingestieroutes, één pijplijn

| Route                             | Richting                                | Betrouwbaarheid                                      | Bestand                                                                                                  |
| --------------------------------- | --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Rechtstreekse push (`Customized`) | WS5500 → `/api/weather/ingest/[secret]` | Onbetrouwbaar (geen HTTPS vanaf het station, zie §1) | `src/app/api/weather/ingest/[secret]/route.ts`                                                           |
| Ecowitt Cloud API (`Ecowitt.net`) | Vercel → `api.ecowitt.net` (pull)       | **De praktische hoofdroute**                         | `src/lib/weather/providers/ecowitt-cloud.ts` + `.../[secret]/route.ts` (onder `providers/ecowitt-cloud`) |

Beide routes leveren uiteindelijk hetzelfde platte, Ecowitt-vormige
key/value-object aan **dezelfde** ingestie-pijplijn
(`src/lib/weather/ingest-pipeline.ts`), die op zijn beurt **dezelfde**
parser (`src/lib/weather/ecowitt/parse.ts`) gebruikt. Er is dus precies één
plek die bepaalt hoe een payload geïnterpreteerd wordt, ongeacht via welke
route hij binnenkwam.

```
                 (onbetrouwbaar zonder HTTPS)
   WS5500 ───────────────────────────────────► /api/weather/ingest/[secret]
      │                                                     │
      │ HTTP, Ecowitt.net                                   │
      ▼                                                     ▼
 api.ecowitt.net  ◄── HTTPS pull ──  /api/weather/providers/ecowitt-cloud/[secret]
                                                             │
                                                             ▼
                                           src/lib/weather/ingest-pipeline.ts
                                                             │
                                            ┌────────────────┼────────────────┐
                                            ▼                ▼                ▼
                                  raw_weather_packets  weather_observations  sensor_measurements
```

## 3. Beveiliging

- **Geheim in het PAD**, niet als header/query-parameter met een
  voorspelbare naam: `/api/weather/ingest/<WEATHER_INGEST_SECRET>`. Een
  routepad met een verkeerd/ontbrekend secret geeft **404** terug (niet
  401/403) — dat bevestigt aan een prober niet eens dát deze route bestaat.
- **Nooit IP-allowlisting als (enige) beveiliging.** Het IP-adres van een
  WS5500 kan wijzigen (DHCP, providerwissel), en het verkeer van de Ecowitt
  Cloud-provider komt sowieso vanaf Vercel's eigen uitgaande adressen, niet
  vanaf het station. IP-adressen worden uitsluitend ter informatie
  opgeslagen (`raw_weather_packets.remote_address`) voor diagnose, nooit
  als toegangscontrole.
- **Constant-tijd secret-vergelijking** (`src/lib/weather/secret.ts`,
  `timingSafeEqual`) zodat een fout secret niet via een tijdsverschil
  geraden kan worden.
- **De diagnosepagina (`/station/diagnostics`) heeft een eigen, apart
  secret** (`STATION_DIAGNOSTICS_SECRET`, als `?key=...`), bewust
  verschillend van `WEATHER_INGEST_SECRET` — het lekken van de ene sleutel
  geeft geen toegang tot de andere verantwoordelijkheid. Zonder geconfigureerd
  secret geeft de pagina altijd 404.
- **De station-identifier (PASSKEY) wordt nooit in platte tekst getoond**
  op een publieke pagina: `/station` toont een gemaskeerde versie
  (`src/lib/weather/redact.ts`), en de diagnosepagina redigeert PASSKEY/
  wachtwoord-achtige velden uit elke getoonde ruwe payload.
- **Geen automatische stationaanmaak.** Een binnenkomende payload met een
  geldig secret maar een onbekende PASSKEY/MAC wordt WEL opgeslagen (voor
  diagnose — zie §4) maar er wordt nooit automatisch een nieuw station
  aangemaakt. Een station bestaat alleen als het via `npm run db:seed` (of
  handmatig in de database) is aangemaakt.
- **Nooit geheimen loggen.** Route-handlers loggen bij een fout alleen een
  korte, geredigeerde samenvatting (`sanitizeRawPayload()`), nooit de ruwe
  payload of het secret zelf.
- **Payload-grootte begrensd** (`MAX_BODY_BYTES`, 256 KB) — los van (en
  kleiner dan) Vercel's eigen requestlimiet van 4,5 MB — om een corrupte of
  kwaadaardige aanvraag niet onnodig veel geheugen te laten gebruiken.

## 4. Raw-first: nooit interpreteren vóór opslaan

`ingestWeatherPayload()` slaat een binnenkomende payload **altijd eerst**
ongewijzigd op in `raw_weather_packets` — inclusief de exacte, letterlijke
request-body (`raw_body_text`) naast de samengevoegde key/value-vorm
(`raw_payload`) — vóórdat er ook maar één veld geïnterpreteerd wordt. Dit
gebeurt zelfs als:

- de station-identifier niet herkend wordt (`station_id` wordt dan `null`);
- de payload een exacte duplicaat is van een eerder ontvangen payload;
- de parser geen enkel bruikbaar meetveld herkent.

Dit is een bewuste, expliciete eis: als de parser een bug blijkt te hebben,
of een toekomstige WS5500-firmware ineens andere velden stuurt, kan alles
opnieuw verwerkt worden (`npm run weather:reprocess`, zie §9) zonder dat er
ooit brondata verloren is gegaan.

## 5. De parser/normalisatielaag

Bewust een losse laag, niet ingebakken in de route-handler:

- `src/lib/weather/ecowitt/fields.ts` — de veldregistratie: welke
  velden kent de parser, in welke groep (hoofdmeting, kanaalgebonden
  sensor, batterij, metadata), en welke plausibiliteitsgrenzen gelden.
- `src/lib/weather/ecowitt/parse.ts` — zet een ruwe payload om naar een
  `ParsedWeatherPacket`: hoofdmeting (`observation`), generieke
  sensor-metingen (`sensors`, bv. batterijen/extra kanalen), een lijst
  herkende velden, een lijst **onbekende** velden (nooit verloren, alleen
  apart gerapporteerd) en waarschuwingen.
- `src/lib/weather/normalize.ts` — zet een `ParsedWeatherPacket` om naar
  daadwerkelijke databaserijen (`weather_observations`/
  `sensor_measurements`), met de juiste decimale precisie per kolom.
- `src/lib/weather/ingest-pipeline.ts` — de orkestratie: station bepalen,
  dedupliceren, opslaan, parsen, normaliseren, status bijwerken. Wordt
  door **beide** ingestieroutes en door `reprocessRawPacket()` gebruikt.

Een individueel meetveld met een onleesbare of onplausibele waarde
(bv. `humidity=-500`) wordt overgeslagen **zonder de rest van de payload te
raken** — zie `tests/weather-parse.test.ts` (`partial-bad-payload`-fixture)
en `tests/weather-ingest-pipeline.test.ts` voor een test die dit expliciet
bewijst. Onbekende velden (bestaande metadata die de parser niet kent, of
toekomstige sensortypes) komen terecht in
`raw_weather_packets.unknown_fields`, zichtbaar op de detailpagina van een
pakket in `/station/diagnostics`.

Nieuwe velden herkennen? Zie [`docs/ECOWITT_FIELDS.md`](ECOWITT_FIELDS.md).

## 6. Deduplicatie

Elke payload krijgt een SHA-256-hash over een gecanonicaliseerde
(sleutels-gesorteerde) vorm van de volledige payload
(`src/lib/weather/hash.ts`). Een latere payload met exact dezelfde hash
voor hetzelfde station wordt gemarkeerd als `"duplicate"` en levert geen
nieuwe meting op — maar het pakket zelf blijft (als apart, gemarkeerd
pakket) bewaard, dus er gaat geen audit-informatie verloren. Dit is
bewust hash-gebaseerd, **niet** timestamp-gebaseerd: twee legitiem
verschillende metingen met een andere `dateutc` botsen nooit, want die
waarde maakt deel uit van de gehashte payload.

## 7. Tijd: UTC, defensief geparsed

Zie `src/lib/weather/timestamp.ts` (uitgebreid becommentarieerd) en
`tests/weather-timestamp.test.ts`. Kort samengevat:

- `dateutc` wordt met expliciete `Date.UTC(...)`-aanroepen geparsed, nooit
  via de impliciete `new Date("...")`-parser — die interpreteert een
  tijdstip zonder tijdzone-aanduiding in de meeste JS-engines als lokale
  tijd van de server, wat op een niet-UTC-machine een stille fout zou
  geven.
- De letterlijke waarde `"now"` (die sommige Ecowitt-firmwares sturen)
  betekent "gebruik het ontvangsttijdstip".
- Een ontbrekend, onleesbaar, of overduidelijk implausibel tijdstip
  (>24 uur in de toekomst, of vóór het jaar 2000) valt terug op het
  ontvangsttijdstip, met een waarschuwing — nooit een crash of
  dataverlies.
- Europese zomertijd/wintertijd is voor dit bestand geen probleem: er wordt
  uitsluitend in UTC gerekend. `stations.timezone` (`Europe/Amsterdam`)
  wordt alleen gebruikt voor presentatie (bv. de tijdstippen op
  `/station/diagnostics`), nooit om `dateutc` te interpreteren.

## 8. Verwerkingsstatus van een ruw pakket

`raw_weather_packets.processing_status` kent vijf waarden:

| Status       | Betekenis                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `received`   | Opgeslagen, nog niet (verder) verwerkt (zeer kortstondig — normaal gesproken direct gevolgd door één van de onderstaande).                                                                                      |
| `normalized` | Volledig geparsed, station herkend, meting zonder kanttekeningen opgeslagen.                                                                                                                                    |
| `partial`    | Station herkend en meting opgeslagen, maar met kanttekeningen (onbekende velden, een overgeslagen implausibele waarde, of een tijdstip-fallback). Geen dataverlies — wel een signaal om de parser te verfijnen. |
| `failed`     | Geen bruikbare meting mogelijk (onbekende station-identifier, of geen enkel herkend meetveld). De ruwe payload blijft hoe dan ook bewaard.                                                                      |
| `duplicate`  | Exact dezelfde payload (hash) al eerder ontvangen voor dit station; niet opnieuw verwerkt.                                                                                                                      |

## 9. Herverwerking na een parser-uitbreiding

Omdat de ruwe payload altijd bewaard blijft, hoeft een parser-uitbreiding
nooit te wachten op nieuwe uploads:

```powershell
# 1. Bekijk welke velden de parser nog niet kent
npm run weather:unknown-fields

# 2. Breid src/lib/weather/ecowitt/fields.ts uit met het nieuwe veld

# 3. Verwerk het/de betreffende pakket(ten) opnieuw met de nieuwe parser
npm run weather:reprocess -- 42
```

`reprocessRawPacket()` (`src/lib/weather/ingest-pipeline.ts`) verwijdert
eerst een eventuele eerder afgeleide meting (en zijn sensor-metingen) vóór
het opnieuw parsen, zodat er nooit een dubbele meting overblijft. De
`parser_version` op het pakket (`PARSER_VERSION` in
`src/lib/weather/ecowitt/parse.ts`) wordt bijgewerkt, zodat altijd zichtbaar
blijft met welke parserversie een pakket voor het laatst verwerkt is.

## 10. Ecowitt Cloud-polling plannen

`/api/weather/providers/ecowitt-cloud/[secret]` (zelfde secret als de
ingestie-route) haalt bij elke aanroep één keer de huidige stand op bij de
Ecowitt Cloud API en verwerkt die door dezelfde pijplijn. Dit project bevat
bewust **geen ingebouwde scheduler** — de afweging:

- Vercel's Hobby-plan staat cronjobs toe, maar (op het moment van
  schrijven) met een minimuminterval dat te grof is voor "actuele"
  weerdata op deze schaal.
- De pragmatische oplossing is een gratis externe pinger (bv.
  [cron-job.org](https://cron-job.org)) die deze URL elke paar minuten
  aanroept, of een Vercel-abonnement met kortere cron-intervallen
  (`vercel.json` met een `crons`-sectie die naar dit pad wijst).
- Beide opties roepen gewoon deze bestaande, beveiligde HTTP-route aan —
  er is dus geen losse achtergrondtaak-infrastructuur nodig, en zeker geen
  lokale always-on bridge.

Zie [`docs/WS5500_SETUP.md`](WS5500_SETUP.md) voor de concrete
instelstappen.

## 11. Prestaties en Vercel Functions-limieten

Gecontroleerd tegen de actuele Vercel-documentatie (`vercel.com/docs/functions/limitations`):

- Maximale requestgrootte: 4,5 MB (ruim voldoende; een Ecowitt-payload is
  typisch < 2 KB).
- Maximale functieduur: 300 seconden op het Hobby-plan (standaard korter).
  De ingestie-pijplijn doet een handvol snelle databasequeries — ruim
  binnen de marge, zonder dat daar iets voor hoeft te worden ingericht.
- Er is bewust **geen wachtrij, geen achtergrondtaak en geen aparte
  worker** toegevoegd (zie ook
  [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) §13) — bij dit schrijfvolume
  (hooguit één keer per ~10–60 seconden, van één station) is dat premature
  complexiteit.

## 12. Bewust nog niet gebouwd

Expliciet buiten scope voor Fase 2 (zie ook de opdracht voor deze fase):

- 24-uursgrafieken, windroos, regenrapporten, jaaroverzichten;
- een recordspagina, CSV-export, uitgebreide historieverkenner;
- notificaties, voorspellingen;
- een publieke, gedocumenteerde externe API;
- een volwaardig accountsysteem (de diagnosepagina gebruikt bewust alleen
  een eenvoudig secret-in-URL-mechanisme, geen login).

## 13. Onzekerheden die nog verificatie met een echt station vereisen

Eerlijk benoemd, zoals de opdracht voor deze fase vraagt: dit project heeft
(nog) geen toegang tot een echt, geregistreerd WS5500-station of een
werkend Ecowitt Cloud-account. De volgende punten zijn gebaseerd op
publieke documentatie/voorbeelden, niet op een geverifieerde, live respons:

- **De exacte JSON-vorm van `GET /api/v3/device/real_time`**
  (`src/lib/weather/providers/ecowitt-cloud.ts`) — de key-namen in de
  `pluck(...)`-aanroepen kunnen op onderdelen afwijken. Zie
  [`docs/ECOWITT_FIELDS.md`](ECOWITT_FIELDS.md) voor hoe dit te
  controleren en te corrigeren.
- **Welke exacte set velden déze WS5500 (met eventuele add-on-sensoren)
  daadwerkelijk stuurt.** `src/lib/weather/ecowitt/fields.ts` dekt de
  gedocumenteerde hoofdmeting plus de meest voorkomende Ecowitt-
  add-onsensoren (WH31/WH51/WH55/WH41/WH57/WH34), maar firmwareversies
  verschillen. `npm run weather:unknown-fields` na de eerste echte
  uploads maakt dit direct zichtbaar.
- **Of een batterijveld een booleaans (0/1) signaal of een spanning
  rapporteert** — dit verschilt per sensortype en is in
  `src/lib/weather/ecowitt/fields.ts` naar beste weten ingeschat op basis
  van de Ecowitt-conventie, maar niet geverifieerd tegen dit specifieke
  station.

Dit is precies waarom Fase 2 bewust **geen** grafieken/statistieken bouwt:
eerst moet vaststaan wát dit station daadwerkelijk stuurt.
