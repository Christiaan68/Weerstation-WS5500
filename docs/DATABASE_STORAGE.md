# Servicebrede opslagbewaker

Stations → Beheer haalt actuele planmetadata en schijfgebruik server-side bij Aiven op. Benodigd zijn de bestaande servervariabelen `AIVEN_API_TOKEN`, `AIVEN_PROJECT` en `AIVEN_SERVICE_NAME`. Deze wijziging maakt geen credentials of services aan en verhoogt geen rechten. Er is geen fallback naar `DATABASE_STORAGE_LIMIT_BYTES` of SQL-bytes voor capaciteitswaarschuwingen.

Het actuele `service.disk_space_mb` is volgens Aiven in MiB. De UI toont decimalen GB/MB; 1024 MiB is dus 1,07 GB, niet 1,00 GB. De waarde wordt bij iedere paginalading opnieuw gelezen, ook na een upgrade. Ontbrekende metadata geeft een onbekende limiet. De read-only metricsaanroep is volgens Aiven een POST naar `/metrics` met `period: hour`. De adapter accepteert Google Charts `disk_usage` met `cols`/`rows`, tijdstippen met expliciete tijdzone of Google Date, en geldige numerieke percentages. Onbekende responsevormen, ontbrekende nodes en metingen ouder dan 15 minuten geven onbekend. De hoogste gerapporteerde nodebenutting bepaalt de waarschuwing (70% / 85%). Een onvolledige nieuwste meting geeft onbekend, ook als een oudere volledige meting beschikbaar is. Het percentage wordt niet omgerekend naar MB: de actuele planlimiet bewijst niet welke fysieke capaciteit op het meetmoment gold.

SQL leest alleen SCHEMATA en TABLES via de bestaande verbinding; alle zichtbare huidige/toekomstige niet-systeemdatabases tellen mee. De query verhoogt geen rechten. Bij beperkte metadatarechten kan deze verdeling onvolledig zijn; dit staat in de UI. Negen bestaande weerstationtabellen behouden hun afzonderlijke uitsplitsing.

Andere schemanamen worden uitsluitend server-side gebruikt voor een geheime HMAC-kleurselectie en verdwijnen vóór de presentatielaag. Payloads bevatten alleen bytes en kleuren; geen namen, identifiers of vreemde tabelnamen. De legenda aggregeert als Overige databases. Kleuren blijven stabiel bij toevoegen van schemas zolang het gebruikte bestaande serversecret gelijk blijft; kleurcollisies zijn mogelijk. Secretrotatie verandert kleuren. Er worden geen upstream fouten gelogd.

De kleurenbalk toont uitsluitend de onderlinge SQL-verdeling. De afzonderlijke schijfbalk volgt de Aiven-meting. SQL-bytes worden niet van een afgeleide fysieke bytewaarde afgetrokken.

30-dagenprognose: Nog onvoldoende historie. De huidige read-only integratie heeft geen historische absolute bytewaarden met capaciteit per tijdstip. Historische percentages mogen na een upgrade niet met de huidige limiet worden vermenigvuldigd. Er worden geen snapshots of meetdata geschreven.

## Validatie en vrijgave

De Aiven-adapter moet vóór productie worden gecontroleerd tegen een toegankelijke echte response; onbekende responsevormen falen bewust veilig. Tijdens deze implementatie was geen lokale Aiven-API-configuratie aanwezig en wees Vercel de bestaande CLI-aanmelding af (HTTP 403). Er is geen productieconfiguratie gewijzigd of deployment gestart.

Bronnen: https://api.aiven.io/doc/ ; https://aiven.io/docs/tools/cli/service-cli ; https://aiven.io/docs/platform/howto/vpc-service-management


## Hercontrole 12 november 2026

De opgeslagen Vercel-aanmelding is met een rechtstreekse, alleen-lezen aanroep gecontroleerd. `GET https://api.vercel.com/v2/user` retourneert HTTP 403 met code `forbidden` en bericht `Not authorized`. Dit is accountauthenticatie vóór projectselectie, deploymenttoegang of Aiven. De eerste poging binnen de beperkte netwerkomgeving gaf DNS-fout ENOTFOUND; de toegestane netwerkpoging bereikte de API en reproduceerde de 403. De response bewijst niet waarom de aanmelding is afgewezen (bijvoorbeeld ingetrokken token of accountrechten). Geen token gewijzigd of opnieuw aangemaakt.

In deze checkout ontbreekt `.vercel/project.json`; er is geen nieuwe koppeling of deployment aangemaakt. De huidige procesomgeving bevat geen `AIVEN_API_TOKEN`, `AIVEN_PROJECT` of `AIVEN_SERVICE_NAME`; er zijn geen lokale `.env`-bestanden aangetroffen behalve het voorbeeld. Productievariabelen, de overeenkomst tussen geselecteerde Aiven-service en databaseverbinding, daadwerkelijke responsevorm en volledigheid van alle nodes blijven ongeverifieerd. De openbare API-specificatie beschrijft metrics slechts als object; Google Charts-compatibiliteit uit CLI-documentatie bewijst niet de precieze nesting van een echte response. Onbekende vormen blijven daarom onbekend in de UI.

De bewaker wordt bij een paginaverzoek opgehaald (`force-dynamic`, `cache: no-store`), niet continu op de achtergrond. Waarschuwingen zijn paginameldingen; er worden geen e-mails of snapshots geschreven. De grens van 15 minuten is een lokale acceptatieregel, geen garantie van Aiven. De servicecapaciteit wordt per aanvraag opnieuw gelezen en heeft geen lokale statische fallback.

Lokale controle: 49 testbestanden, 558 tests geslaagd. Nieuwe regressiegevallen controleren onvolledige nieuwste metingen in beide sorteervolgordes, meerdere nodes, ontbrekende nodes, toekomstige/ongeldige tijdstippen en HTTP-, JSON- en netwerkfouten. De standaard Turbopack-build faalt in deze uitvoeromgeving op `binding to a port: Operation not permitted`, ook na een ruimere uitvoerpoging.

De alternatieve productiebuild `npm run build -- --webpack` is volledig geslaagd, inclusief TypeScript en paginageneratie, met uitsluitend tijdelijke fictieve procesvariabelen voor database/login. Zonder deze variabelen stopte de build terecht bij de bestaande omgevingsvalidatie. Er zijn geen secretsbestanden geschreven en geen echte databasegegevens gebruikt. Dit bewijst compileerbaarheid, niet werking met productieconfiguratie. Gerichte ESLint-, Prettier- en `git diff --check`-controles zijn geslaagd.
