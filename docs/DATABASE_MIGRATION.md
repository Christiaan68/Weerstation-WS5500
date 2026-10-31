# Weerstation verhuizen van TiDB naar Aiven MySQL

## Vastgesteld op 31 oktober 2026

- TiDB-instantie **Weerstation**: 62,5 miljoen Request Units gebruikt,
  53,26 MiB row storage. Verbindingen worden geweigerd wegens het quotum.
- De TiDB-console weigert ook een volledige SQL-export:
  `Export is not allowed for clusters that reach the Spending Limit and are experiencing throttling.`
- Er is nog geen export/back-up gemaakt, geen import uitgevoerd en geen
  productieverbinding omgezet. Stationrecords en historische data zijn niet gewijzigd.
- **Huisnummerbordjes** is een afzonderlijke instantie; deze wordt niet gewijzigd.
- Het gratis Aiven MySQL-plan biedt 1 GB schijfruimte, 1 GB RAM en één CPU.
  Deze capaciteit is een kandidaat voor de bestaande database; controleer
  daadwerkelijke index-, systeem- en dataruimte na import en monitor de groei.
  Het plan heeft geen SLA. https://aiven.io/docs/products/mysql/concepts/mysql-free-tier
- De eigenaar heeft zich aangemeld. Dienst `weerstation-mysql` is aangemaakt
  in project `tenhaaken-cc3c`, op plan `free-1-1gb`, MySQL 8.4, DigitalOcean
  Amsterdam. De dienst is gecontroleerd op **Running**. De lege service gebruikt
  volgens de console 29,6% van 1 GB (systeemruimte inbegrepen); de werkelijke
  vrije ruimte moet na import worden gecontroleerd. Productie is nog niet naar
  deze dienst omgezet.

## Lokale voorbereiding gecontroleerd

- Optionele `DATABASE_SSL_CA` toegevoegd voor app en Drizzle, met behoud van
  verplichte certificaatcontrole en TLS 1.2 of hoger.
- Dashboard en `/api/weather/current` vroegen elke refresh alle negen soorten
  dagrecords op, terwijl ze slechts temperatuur-min/max gebruiken. Hiervoor is
  één gerichte, stationgebonden MIN/MAX-query met lokale daggrenzen toegevoegd.
  De records-pagina blijft ongewijzigd. Dit verwijdert aantoonbaar overbodige
  zoekopdrachten; de bijdrage aan het productie-RU-verbruik is nog niet gemeten.
- Typecheck en lint geslaagd; 45 testbestanden met 486 tests geslaagd, inclusief
  TLS, lege temperatuurwaarden, vorst/nul, stationsisolatie en zomer-/wintertijd.
- De productiebuild met Webpack slaagt met niet-geheime voorbeeldwaarden
  voor de verplichte lokale environment variables. De standaard Turbopack-build
  loopt in deze werkomgeving vast op lokale proces-/poortrechten, ook bij de
  herhaalde poging met verruimde uitvoerrechten. Er is niet tegen de nieuwe
  Aiven-service getest: de data-import en een daadwerkelijke applicatieverbinding
  ontbreken nog.
- Voorbereiding is lokaal gecommit; niets gepusht of gedeployed.

## Voorbereiding

1. Maak een gratis Aiven-account en een MySQL-service met het **Free**-plan.
   Kies geen trial of betaald plan. Bewaar verbindingsgegevens buiten git/chat.
2. Download het CA Certificate van de service. De app en Drizzle ondersteunen
   `DATABASE_SSL_CA`: de volledige PEM-bundel met echte regeleinden of
   letterlijke `\n`. Certificaatcontrole blijft verplicht.
3. Laat cron-job.org uit en voorkom andere schrijvers naar de bron tijdens
   export, vergelijking en omschakeling. Wijzig productie nog niet.
4. Wacht conform de keuze van de eigenaar op de TiDB-maandreset. Als TiDB
   daarna nog blokkeert, stop en onderzoek dat; maak geen leeg vervangend station.

## Export, import en controle

1. Controleer dat de bestaande TiDB-database weer leesbaar is. Maak een volledige
   logische SQL-back-up van uitsluitend de database `weerstation`, inclusief
   schema, alle tabellen en migratie-administratie. Bewaar het originele bestand
   privé in de genegeerde map `.database-backups/`, leg een SHA-256-hash vast en
   controleer dat de export slaagt. Beperk bestandsrechten tot de eigenaar.
   Gebruik een consistente snapshot; exporteer timestamps in UTC.
2. Leg vóór import per tabel de exacte aantallen vast, alle primaire sleutels,
   oudste/nieuwste meettijd en een checksum van canoniek gesorteerde volledige
   rijinhoud. Bewaar dit privé: ook stationcredentials kunnen onderdeel zijn van
   de database. Controleer de werkelijke productiestructuur, niet alleen het
   huidige Drizzle-schema. Controleer bestaande default/active/provider/device-
   instellingen zonder sleutels in uitvoer te tonen.
3. Controleer de SQL op TiDB-specifieke eigenschappen en compatibiliteit met de
   daadwerkelijke MySQL-versie van Aiven. Bewaar de originele export ongewijzigd.
   Importeer in een lege doeldatabase, met behoud van **alle** bestaande IDs,
   foreign keys, indexen, decimals, JSON en milliseconden. Voer geen seed,
   demo-generator of `db:push` uit. Controleer AUTO_INCREMENT na de import.
4. Vergelijk alle tabelnamen, schema's, rijinhoud/checksums en aantallen. Controleer
   dat alle station-, observation-, packet- en summary-koppelingen behouden zijn
   en dat er geen verweesde foreign keys zijn. Aantallen alleen zijn onvoldoende.
5. Test TLS met de Aiven-CA en test lokaal de app tegen de geïmporteerde database.
   Draai typecheck, lint, tests en build. Importeer geen nieuwe metingen voordat
   de snapshotvergelijking slaagt.

## Productie omschakelen

1. Bewaar de oude productieconfiguratie privé voor rollback. Zet in Vercel voor
   **Production** de nieuwe `DATABASE_URL` met exacte Aiven-host, -poort en
   doeldatabase, plus `DATABASE_SSL_CA`. Geef URL-onderdelen met bijzondere
   tekens de juiste URL-encoding. Zet TLS-controle nooit uit.
2. Roteer het eerder blootgestelde `WEATHER_INGEST_SECRET` veilig in Vercel en
   cron-job.org. Plaats het niet in chat, git of loguitvoer. Deploy opnieuw.
3. Controleer `/api/health`, dashboard en historie op het custom domein én de
   productiealias `weerstation-ws-5500.vercel.app`.
4. Zet de cron-URL op het custom domein, met dezelfde bestaande providerroute
   en het nieuwe secret. Test handmatig: HTTP 200 **en** een geslaagd
   stationresultaat. Een HTTP 200 met `failed > 0` is geen succesvolle poll.
5. Schakel de job in en controleer minstens drie opeenvolgende geslaagde polls,
   actuele meettijden, historische data en ongewijzigde oorspronkelijke station-ID.
6. Controleer opslag/verbindingen en de belasting op het gratis Aiven-plan.

## TiDB pas na succesvolle omschakeling vrijmaken

Bewaar een gecontroleerde, herstelbare lokale back-up en het migratierapport.
Vraag bij de definitieve verwijderactie expliciete bevestiging met de exacte
naam **Weerstation**. Verwijder uitsluitend de oude Weerstation-instantie;
Huisnummerbordjes en de organisatie blijven bestaan. Controleer daarna in de
TiDB-console dat de bedoelde instantie weg is. Tot dat moment blijft TiDB
beschikbaar als bron voor herstel; het quotum is verbruik, geen volgelopen opslag.
