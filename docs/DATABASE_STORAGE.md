# Database-opslag

Beheer toont de som van data en indexen van de negen weerstationtabellen via de bestaande centrale MySQL-verbinding. De query leest uitsluitend information_schema; er worden geen data of statistieken gewijzigd.

## Planlimiet instellen

Stel `DATABASE_STORAGE_LIMIT_BYTES` server-side in voor de juiste omgeving. De actieve Aiven-service `weerstation-mysql` toont op 1 november 2026 in de console **Free-1-1gb**, **1 GB storage**. Daarvoor gebruiken we `1000000000` bytes (decimaal: 1 GB = 1000 MB). Deze waarde staat uitsluitend in de omgevingsconfiguratie; er is geen standaardlimiet in de appcode. Na een planwijziging: controleer de nieuwe limiet in Aiven, pas deze variabele aan en deploy opnieuw.

Een ontbrekende, nul-, negatieve of ongeldige limiet geeft expliciet onbekende maximale/vrije opslag, zonder percentage of capaciteitsbalk. De tabelverdeling blijft zichtbaar. Geldige waarden zijn positieve gehele veilige getallen in bytes.

De balk toont gebruikte tabelruimte tegenover de ingestelde limiet. Vrij = maximaal min gebruikt, met minimaal nul. Het percentage mag boven 100% komen; de balk blijft maximaal 100% en een waarschuwing meldt de overschrijding. Bij ontbrekende tabelmetadata staat er subtotaal en een waarschuwing.

MySQL-statistieken zijn schattingen en kunnen achterlopen. Serverlogs, back-ups, systeemtabelruimte en andere databases tellen niet mee; de berekende vrije ruimte is daarom geen vrije-schijfmeting van de hele Aiven-service. Er worden geen credentials of verbindingsgegevens getoond.
