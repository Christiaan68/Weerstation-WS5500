# Gerichte vereenvoudiging opslag — 14 november 2026

## Basis en toepassing

Basis: het eerder geüploade archief, lokaal teruggevonden als `~/Desktop/weerstation-code-review.zip` (245 bestanden). `/mnt/data` is in deze sessie niet beschikbaar. De relevante opslagmodules kwamen overeen met de lokale werkversie. De patch is relatief aan het ZIP-archief, niet aan Git HEAD: de eerdere klaargezette opslagbewaker zit al in de basis.

De wijzigingen zijn al in de lokale werkbestanden toegepast; niet nogmaals toepassen. Bestaande staged wijzigingen zijn niet opnieuw gestaged of gecommit. Voor een andere repository met dezelfde archiefbasis: controleer eerst `git apply --check storage-simplification.patch`, pas daarna `git apply storage-simplification.patch` toe. Geen push of deployment uitgevoerd.

## Wijzigingen en afbakening

- Eén pure validator voor SQL-bytewaarden in beide opslagmodules. Ontbrekende, lege, ongeldige en onveilige waarden tellen niet als nul. Alleen systeemmetadata levert geen fictief nultotaal op; overlopende totalen blijven onbekend.
- SQL-queries bewust afzonderlijk behouden: de tabeluitsplitsing leest negen expliciete weerstationtabellen in de huidige database; de serviceverdeling omvat alle zichtbare niet-systeemschema’s, inclusief eventuele extra tabellen in de huidige database. De totalen zijn dus niet onderling uitwisselbaar. Geen bredere query, cache of gedeelde foutafhandeling ingevoerd.
- Recordgroeischatting op de stationpagina expliciet onderscheiden van fysieke Aiven-schijfbezetting. De vaste melding over onvoldoende historie vervangen: de app bewaart hiervoor nog geen historische schijfmetingen; wachten alleen levert dus geen 30-dagenprognose op.
- Ongebruikte `parseStorageLimit` en `getStorageCapacity` verwijderd. Hun tests vervangen door relevante formatteringscontroles. `DATABASE_STORAGE_LIMIT_BYTES` blijft als verouderd compatibiliteitsveld geaccepteerd; geen omgevingsinstellingen gewijzigd. De bestaande test dat deze limiet niet als Aiven-fallback wordt gebruikt blijft behouden.
- Geen wijziging in groeiformules, Aiven-endpoints, authenticatie, fysieke meetinterpretatie, 70%/85%-drempels of SQL-scope.

## Validatie

- Lokale repository: alle 550 tests in 50 bestanden geslaagd, inclusief 68 gerichte opslagtests.
- Lokale TypeScript-controle: `tsc --noEmit --incremental false` geslaagd (bestaande gegenereerde routetypes).
- ESLint op alle elf gewijzigde/nieuwe bron- en testbestanden geslaagd; `git diff --check` geslaagd.
- Archiefcontrole in aparte tijdelijke map zonder env-bestanden of echte databaseverbinding: 493 tests geslaagd, drie suites geblokkeerd door ontbrekend `src/lib/db/index.ts`.
- Het archief bevat ook geen `vitest.config.mts` (de export nam `.mts` niet mee). Voor de archieftests is de lokale configuratie met uitsluitend padresolutie/testinstellingen gebruikt.
- Archief `npm run typecheck`: routegeneratie slaagt; TypeScript faalt op ontbrekende database-imports en afgeleide typefouten. Geen databasevervanger toegevoegd om dit kunstmatig groen te maken.
- Archiefbuild: Turbopack blokkeert op de externe node_modules-symlink. De aanvullende webpack-build bereikt de broncompilatie en blokkeert op de ontbrekende database-module. Geen geslaagde productiebuild geclaimd.

## Aanvullende lokale afsluitcontrole — 14 november 2026

- Afbakening opnieuw bekeken: de gerichte opslagwijzigingen blijven beperkt tot validatie, uitleg en het verwijderen van ongebruikte helpers. Bestaande staged wijzigingen en niet-gerelateerde werkbestanden zijn behouden. De reverse apply-check van de ZIP-relatieve patch en `git diff --check` slagen.
- De standaard lokale `npm run build` (Turbopack) blokkeert op het openen van een lokale poort (`Operation not permitted`), ook na een poging met ruimere uitvoerrechten. Dit is een uitvoeringsbeperking; deze poging toont geen fout in de opslagcode aan.
- De aanvullende `npm run build -- --webpack` compileert en doorstaat TypeScript, maar stopt zonder lokale configuratie tijdens prerendering van `/_not-found`: `DATABASE_URL` en de drie verplichte `SITE_AUTH_*`-waarden ontbreken.
- Met tijdelijke fictieve waarden uitsluitend in de procesomgeving slaagt de volledige webpack-productiebuild, inclusief typecontrole, paginageneratie en build traces (exitcode 0). De database-URL wijst naar `127.0.0.1:1/build_only`; geen echte databasegegevens of Aiven-credentials gebruikt en geen env-bestand aangepast. Deze build is een lokale verificatie, geen productieartifact voor uitrol.
- Geen broncodewijziging nodig gebleken. Tests zijn niet opnieuw uitgevoerd: er is geen broncode aangepast; de eerder vermelde testresultaten blijven de testbasis. Alleen dit rapport is aangevuld. Niets gestaged, gecommit, gepusht of uitgerold.
- Conclusie: de volledige lokale app kan met webpack en geldige configuratievorm worden gebouwd. De standaard Turbopack-build blijft in deze uitvoeromgeving onbevestigd, evenals de werking en meetinterpretatie tegen de echte Aiven-dienst.

## Resterende beperkingen

`src/lib/db/index.ts` is lokaal aanwezig, maar ontbreekt in het reviewarchief; niet gewijzigd of in het reviewpakket opgenomen. De daadwerkelijke pool-, TLS- en verbindingsconfiguratie is geen onderdeel van deze beoordeling. Unit-tests gebruiken nagebootste SQL/Aiven-antwoorden: echte responses, metriekvormen, eenheden, rechten en nodebetekenis zijn niet geverifieerd. Daaruit volgt geen productiegarantie.

TiDB, abonnement, meetdata, Energieplatform, secrets en de bestaande Aiven-productiedatabase zijn ongemoeid gelaten. Geen migratie, tokenaanmaak, productieconfiguratiewijziging, push of deployment.
