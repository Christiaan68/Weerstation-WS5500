# WS5500 aansluiten: stap voor stap

Deze gids beschrijft hoe je de Alecto WS5500 (of het onderliggende
Ecowitt/Fine-Offset-station) daadwerkelijk gaat koppelen aan deze
applicatie, nadat Fase 2 (data-ingestie) is opgeleverd. Lees eerst
`docs/WS5500_INGESTION.md` voor de achtergrond — met name **waarom er twee
routes zijn** (rechtstreekse upload én de Ecowitt Cloud API) en waarom de
rechtstreekse route in de praktijk vaak niet werkt (geen TLS-ondersteuning
in het station).

Deze twee routes sluiten elkaar niet uit: je kunt ze allebei instellen. Lukt
de rechtstreekse upload niet (de meest waarschijnlijke uitkomst), dan vang
je alles op via de Cloud API-route.

## 1. PASSKEY van je station opzoeken

1. **Waar:** WSView Plus-app (telefoon/tablet) — de app waarmee je de
   WS5500 oorspronkelijk hebt ingesteld.
2. **Wat:** open je station → **Device List** → tik op je WS5500 →
   **More settings** (of vergelijkbaar, afhankelijk van de app-versie).
   Zoek de sectie met de rechtstreekse serverconfiguratie (vaak
   **"Customized"** of **"Weather Server"**). Daar staat een veld met de
   naam **PASSKEY** (soms ook zichtbaar via **"Device Info"**).
3. **Inhoud:** kopieer deze waarde exact — dit is de unieke identifier van
   jouw station. Het is géén wachtwoord dat je zelf instelt; het station
   genereert dit zelf.
4. **Controle:** je hebt een string van ongeveer 32 tekens (letters en
   cijfers), bijvoorbeeld `A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4`.

Let op: deze PASSKEY is een **echt geheim** in deze applicatie — wie hem
kent, kan (in combinatie met de ingestie-secret) valse weerdata insturen
voor jouw station. Deel hem niet en zet hem nooit in screenshots, git of
documentatie. Op de publieke `/station`-pagina wordt hij daarom automatisch
gemaskeerd weergegeven.

## 2. Station-record in de database bijwerken

Het seed-script (`npm run db:seed`) gebruikt tot nu toe een **fictieve**
identifier (`demo-ws5500-0001`). Vervang die door de echte PASSKEY uit
stap 1.

1. **Waar:** projectmap, bestand `scripts/seed.ts`.
2. **Wat:** wijzig het veld `stationIdentifier` in het object
   `DEMO_STATION` naar je echte PASSKEY. Wijzig ook `macAddress` naar het
   echte MAC-adres van het station als je dat kent (te vinden in dezelfde
   WSView Plus-schermen, of laat dit veld op `null`/weg als je het niet
   hebt — de PASSKEY is voldoende om te matchen).
3. **Controle:** run in de projectmap (met `.env.local` ingesteld op je
   TiDB-database):

   ```powershell
   npm run db:seed
   ```

   De uitvoer meldt "...is bijgewerkt" met het bestaande station-id.

   Alternatief zonder het bestand te wijzigen: pas de rij rechtstreeks aan
   via `npm run db:studio` (Drizzle Studio opent in de browser) — open de
   tabel `stations` en werk `station_identifier` (en eventueel
   `mac_address`) direct bij.

## 3. Environment variables instellen

1. **Waar:** lokaal in `.env.local` (projectroot); in productie in Vercel
   onder **Project Settings → Environment Variables** (zie ook
   `docs/VERCEL_SETUP.md`).
2. **Wat en inhoud:**

   | Variabele                    | Waarde                                                                                                                                                                | Omgevingen                                                                                                            |
   | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
   | `WEATHER_INGEST_SECRET`      | een lange, willekeurige string. Genereer er een met `openssl rand -hex 32` (in PowerShell: `-join ((1..32) \| ForEach-Object { "{0:x2}" -f (Get-Random -Max 256) })`) | Development, Preview, Production — gebruik gerust dezelfde waarde overal, of aparte waarden als je dat veiliger vindt |
   | `STATION_DIAGNOSTICS_SECRET` | een **andere** lange, willekeurige string (zelfde manier genereren)                                                                                                   | Development, Preview, Production                                                                                      |
   | `ECOWITT_APPLICATION_KEY`    | zie stap 5 hieronder                                                                                                                                                  | Production (en Preview als je daar ook wilt testen)                                                                   |
   | `ECOWITT_API_KEY`            | zie stap 5 hieronder                                                                                                                                                  | Production                                                                                                            |
   | `ECOWITT_DEVICE_MAC`         | zie stap 5 hieronder                                                                                                                                                  | Production                                                                                                            |

3. **Controle:** na het instellen in Vercel moet je opnieuw deployen
   (Vercel doet dit niet automatisch met terugwerkende kracht op een
   lopende deployment) — zie `docs/VERCEL_SETUP.md`. Lokaal: herstart
   `npm run dev` zodat de nieuwe waarden geladen worden.

**Belangrijk:** verander je `WEATHER_INGEST_SECRET` in productie nadat het
station al is ingesteld (stap 4), dan moet je de URL in het station
opnieuw invoeren — het oude pad geeft dan 404.

## 4. Het station naar deze applicatie laten uploaden (rechtstreeks)

Dit is de route die volgens onze analyse **waarschijnlijk niet werkt**
zonder tussenstap (zie `docs/WS5500_INGESTION.md`), maar hij kost niets om
te proberen — mislukt hij, dan weet je zeker dat je op de Cloud API-route
(stap 5) aangewezen bent.

1. **Waar:** WSView Plus-app → jouw station → serverinstellingen (dezelfde
   plek als in stap 1) → optie **"Customized"**.
2. **Wat:** vul in:
   - **Server IP/Hostname:** je Vercel-domein, bijvoorbeeld
     `mijn-weerstation.vercel.app` (zonder `https://` ervoor als het veld
     dat niet toestaat)
   - **Path:** `/api/weather/ingest/<WEATHER_INGEST_SECRET>` — dus de
     échte waarde die je in stap 3 hebt ingevuld, niet de placeholdertekst
   - **Port:** `443`
   - **Upload Interval:** naar wens, bv. 60 seconden
   - **Protocol type:** kies **Ecowitt** als die keuze geboden wordt (niet
     Wunderground) — dit bepaalt welke veldnamen het station verstuurt; de
     parser ondersteunt overigens beide.
3. **Controle:** wacht een paar minuten (of het ingestelde interval) en
   controleer `/station/diagnostics?key=<STATION_DIAGNOSTICS_SECRET>`. Komt
   er een nieuw pakket binnen met status **normalized** of **partial**, dan
   werkt de rechtstreekse route gewoon — mooi meegenomen, sla stap 5 dan
   over (of stel hem toch in als extra zekerheid; dubbele pakketten worden
   automatisch als "duplicate" herkend en veroorzaken geen dubbele
   metingen).

   Komt er **niets** binnen, dan bevestigt dat de vermoede TLS-beperking.
   Ga door naar stap 5.

## 5. Ecowitt Cloud API instellen (aanbevolen hoofdroute)

Deze route laat het station gewoon naar **Ecowitt.net** uploaden (dat kan
het station wél rechtstreeks, want dat is precies waarvoor de fabrikant het
heeft ingericht) en deze applicatie haalt de actuele waarden vervolgens
zelf op bij Ecowitt.

1. **Waar:** WSView Plus-app → jouw station → serverinstellingen → optie
   **"Ecowitt.net"** (niet "Customized").
2. **Wat:** activeer deze optie. Het station registreert zichzelf
   automatisch bij Ecowitt met zijn PASSKEY zodra dit aanstaat en er
   internetverbinding is.
3. **Controle:** log in op [ecowitt.net](https://www.ecowitt.net) (maak een
   gratis account aan als je die nog niet hebt) → **My Devices**. Je
   station moet daar verschijnen met actuele meetwaarden.
4. **Waar:** ecowitt.net, ingelogd → **Account → API Key** (soms onder een
   tandwiel-/profielicoon).
5. **Wat:** noteer je **Application Key** en **API Key**. Zoek daarnaast
   het **MAC-adres** van je station terug (zichtbaar bij de apparaatgegevens
   op ecowitt.net of in WSView Plus).
6. **Inhoud:** zet deze drie waarden in `.env.local` / Vercel (zie stap 3):
   ```
   ECOWITT_APPLICATION_KEY=<jouw application key>
   ECOWITT_API_KEY=<jouw api key>
   ECOWITT_DEVICE_MAC=<MAC-adres, bv. AA:BB:CC:DD:EE:FF>
   ```
7. **Controle:** roep het poll-endpoint handmatig aan (vervang
   `<WEATHER_INGEST_SECRET>` door de echte waarde):
   ```
   https://mijn-weerstation.vercel.app/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>
   ```
   Een 200-respons met `{"ok":true,...}` betekent dat de Cloud API bereikt
   is en een pakket is verwerkt. Controleer vervolgens
   `/station/diagnostics` voor het resultaat. Een 502 betekent dat Ecowitt
   niets teruggaf (nog geen upload van het station ontvangen, of foutieve
   sleutels) — de exacte foutmelding staat in de diagnostics-pagina onder
   de "Ecowitt Cloud"-kaart.

### Herhaald ophalen instellen (geen ingebouwde scheduler)

Deze applicatie roept de Cloud API **niet vanzelf** periodiek aan — Vercel
Functions draaien alleen op een binnenkomend verzoek (zie
`docs/WS5500_INGESTION.md` §Scheduling). Je hebt dus een externe trigger
nodig die dit poll-endpoint elke paar minuten aanroept:

1. **Waar:** [cron-job.org](https://cron-job.org) (gratis, geen
   creditcard) of een vergelijkbare externe cron-dienst; heb je toch al een
   betaald Vercel-abonnement met Vercel Cron beschikbaar, dan kan dat ook.
2. **Wat:** maak een nieuwe cron-job aan die een **GET**-verzoek doet naar
   de URL uit stap 7 hierboven, elke 5 minuten (of vaker, tot het interval
   dat je station gebruikt).
3. **Controle:** na een paar cycli toont
   `/station/diagnostics?key=...` bij "Ecowitt Cloud" een recente
   `lastSuccessAt`-tijdstip en het aantal ontvangen pakketten stijgt.

## 6. De hele keten testen zonder op het station te wachten

Handig tijdens het instellen, of om te controleren of een codewijziging
niets breekt:

1. **Waar:** projectmap, terminal (PowerShell), met `npm run dev` actief in
   een ander venster of tegen je Vercel-deployment.
2. **Wat:**
   ```powershell
   npm run weather:test-payload -- --fixture=full-payload
   ```
   Dit stuurt een realistische testpayload naar
   `/api/weather/ingest/<WEATHER_INGEST_SECRET>` (leest de secret uit
   `.env.local`) met de PASSKEY van je (enige) actieve station erin
   ingevuld. Andere fixtures: `minimal-payload`,
   `wunderground-get-payload` (voeg `--method=GET` toe),
   `unknown-fields-payload`, `battery-fields-payload`,
   `malformed-payload`, `partial-bad-payload`. Tegen een live
   Vercel-deployment: voeg `--url=https://mijn-weerstation.vercel.app` toe.
3. **Controle:** de terminal toont de HTTP-status (moet 200 zijn) en de
   JSON-respons. Open daarna `/station/diagnostics?key=...` en klik het
   nieuwste pakket open om de volledige verwerking te zien (herkende
   velden, eventuele waarschuwingen, afgeleide meting).

## 7. Eerste echte data controleren

1. **Waar:** browser, `/station/diagnostics?key=<STATION_DIAGNOSTICS_SECRET>`.
2. **Wat:** controleer na de eerste echte upload (via route 4 of 5):
   - staat het pakket op status **normalized**? Dan is alles herkend.
   - staat het op **partial**? Klik het pakket open — de
     "Parserwaarschuwingen" laten precies zien welk veld niet vertrouwd
     werd en waarom. Dit is vaak een onbekend of net-buiten-bereik veld,
     geen fout in de applicatie.
   - staat het op **failed** met "onbekend station"? Dan matcht de
     PASSKEY in de payload niet met `stationIdentifier` in de database —
     controleer stap 1/2 opnieuw.
3. **Wat (vervolg):** staan er velden onder "Onbekende velden" die
   regelmatig terugkomen? Draai:
   ```powershell
   npm run weather:unknown-fields
   ```
   en volg de instructies in `docs/ECOWITT_FIELDS.md` om ze toe te voegen
   aan de parser.
4. **Controle:** na het uitbreiden van de parser en herverwerken
   (`npm run weather:reprocess -- <pakket-id>`) staat het pakket alsnog op
   **normalized**, en toont `/api/weather/current` de nieuwe velden.

## Samenvatting: wat moet ik zelf nog doen?

- **Noodzakelijk:** PASSKEY opzoeken (stap 1), station-record bijwerken
  (stap 2), `WEATHER_INGEST_SECRET` en `STATION_DIAGNOSTICS_SECRET`
  instellen (stap 3), minstens één van de twee upload-routes instellen
  (stap 4 en/of 5) zodat er data binnenkomt.
- **Aanbevolen:** de Ecowitt Cloud-route instellen (stap 5) plus een
  externe cron-trigger, aangezien de rechtstreekse route naar verwachting
  niet werkt.
- **Optioneel:** de rechtstreekse route (stap 4) toch proberen — kost niets
  en werkt als extra zekerheid mocht Ecowitt.net ooit onbereikbaar zijn.
