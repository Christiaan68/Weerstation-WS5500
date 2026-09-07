# Hoe je weerstation-website in elkaar zit

Dit document legt uit hoe `mijnweerstation.nl` is opgebouwd: welke pagina's en
functies erop staan, welke techniek eronder zit, welke online diensten
worden gebruikt, en hoe de site online blijft en verder uitgebreid kan
worden. Het is geschreven zonder technische voorkennis te veronderstellen.

## 1. Opbouw van de website

De website draait om één ding: de metingen van je Alecto WS5500-weerstation
overzichtelijk tonen, zowel actueel als over langere tijd. Alle pagina's
delen dezelfde koptekst (met het menu en de licht/donker-schakelaar) en
voettekst, en werken op laptop, tablet en telefoon.

**Dashboard** — de startpagina. Toont de actuele metingen (ververst
automatisch, ongeveer elke minuut), een passende weer-illustratie die
zich aanpast aan de omstandigheden (bijvoorbeeld helder, bewolkt, mist,
regen, sneeuw, zonsopkomst — afgeleid uit de echte sensordata, dus geen
aparte weersverwachting), de min/max-temperatuur van vandaag, en per
onderwerp een grafiekkaart van de afgelopen 24 uur: temperatuur,
binnentemperatuur, luchtvochtigheid/luchtdruk, wind, neerslag en
zon/UV. Ook een paar extra kaarten met aanvullende metingen (gevoels-
temperatuur, binnenklimaat, regen per periode).

**Grafieken** — hier kies je zelf een onderwerp (temperatuur, vochtigheid,
druk, wind, regen, UV/zon) en een periode (24 uur, 7 dagen, 30 dagen,
90 dagen, 1 jaar of alles), met knoppen om terug en vooruit in de tijd te
bladeren. Er zit ook een downloadknop bij om precies de getoonde gegevens
als bestand te bewaren.

**Regen** — een apart overzicht van neerslag: totaal per dag/week/maand/
jaar, de hoogste gemeten regenintensiteit, en een staafgrafiek.

**Wind** — windroos (laat zien uit welke richtingen de wind het meest komt)
en windstatistieken.

**Records** — de hoogste en laagste waarden die ooit gemeten zijn, per
periode (vandaag, deze maand, dit jaar, altijd).

**Data** — een tabel waarin je door alle losse metingen kunt bladeren,
filteren, sorteren en zelf kolommen kunt aan- en uitzetten; ook hiervandaan
is een CSV-download mogelijk.

**Kwaliteit** — laat per dag en per maand zien of er metingen gemist zijn
(bijvoorbeeld door een tijdelijke storing), zodat duidelijk is hoe
betrouwbaar de historische gegevens zijn.

**Station** — informatie over het gekoppelde station zelf en of de
automatische gegevensophaling actief, vertraagd of gestopt is.

Daarnaast bestaat er een beveiligde, niet in het menu opgenomen
diagnosepagina voor technische controle van binnengekomen data — alleen
toegankelijk met een geheime sleutel, bedoeld voor jou als beheerder, niet
voor bezoekers.

Achter al deze pagina's zit één centrale opslagplaats met metingen: elke
binnenkomende meting van het station wordt eerst ruw bewaard en daarna
"vertaald" naar nette, herkenbare velden (temperatuur, luchtvochtigheid,
windsnelheid, enzovoort). Dagelijkse, maandelijkse en jaarlijkse
samenvattingen worden apart bijgehouden, zodat grafieken over lange
periodes snel blijven laden zonder telkens alle losse metingen opnieuw te
hoeven doorrekenen.

## 2. De technische basis

In gewone taal: welke bouwstenen zorgen ervoor dat de website werkt.

- **TypeScript** — de programmeertaal waarin de site is geschreven. Dit is
  een uitgebreide versie van JavaScript (de standaardtaal van websites) die
  vooraf al veel typefouten en onlogische code opspoort, vóórdat een
  bezoeker er last van kan hebben.
- **Next.js** — het framework (bouwraamwerk) waarop de hele site draait.
  Het regelt hoe pagina's worden opgebouwd en aan bezoekers getoond, deels
  al kant-en-klaar vanaf de server (snel, ook goed voor vindbaarheid) en
  deels interactief in de browser (bijvoorbeeld de automatische verversing
  op het dashboard).
- **React** — de bibliotheek waarmee de onderdelen van een pagina (kaarten,
  knoppen, grafieken) worden opgebouwd als herbruikbare bouwblokken.
- **Tailwind CSS** — zorgt voor de vormgeving en lay-out: kleuren, afstanden,
  het responsief maken voor telefoon/tablet/laptop, en het licht/donker-
  thema.
- **Recharts** — de bibliotheek die de lijn- en staafgrafieken tekent.
- **Drizzle** — een hulpmiddel dat de programmeercode veilig en overzichtelijk
  laat communiceren met de database, zonder losse, foutgevoelige
  databasecommando's met de hand te hoeven schrijven.
- **Zod** — controleert of gegevens (bijvoorbeeld instellingen of binnen-
  komende data) aan de verwachte vorm voldoen, zodat fouten meteen duidelijk
  worden in plaats van pas later onverklaarbare problemen te geven.
- **Vitest** — een testraamwerk: een verzameling automatische controles
  (op dit moment enkele honderden) die bij elke wijziging bevestigen dat
  bestaande onderdelen (berekeningen, dataverwerking) nog steeds correct
  werken.

Al deze onderdelen zijn nodig om de site te laten draaien; ze maken deel
uit van de gepubliceerde website zelf (op één uitzondering na: Vitest is
alleen een controlemiddel tijdens het bouwen, niet iets dat bezoekers
gebruiken).

## 3. De gebruikte platforms en tools

Dit is waar de verschillende onderdelen "wonen" en met elkaar praten.

**GitHub** — hier staat de broncode van de website bewaard en wordt elke
wijziging bijgehouden (versiebeheer). Dit is ook de plek van waaruit Vercel
(zie hieronder) automatisch een nieuwe versie publiceert zodra er iets
wordt bijgewerkt.

**Vercel** — het hostingplatform: hier draait de website daadwerkelijk voor
bezoekers. Vercel bouwt de site automatisch op zodra er een wijziging naar
GitHub wordt gestuurd, zorgt voor een beveiligde verbinding (SSL/HTTPS), en
regelt de koppeling met je eigen domeinnaam.

**TiDB Cloud** — de database in de cloud waarin alle weermetingen (ruw én
verwerkt) permanent worden opgeslagen. Zonder deze database zou de site
geen historische gegevens kunnen tonen.

**Ecowitt.net (Ecowitt Cloud API)** — de eigen cloud-dienst van je
weerstation. Het station stuurt zijn metingen naar Ecowitt; de website haalt
die gegevens vervolgens periodiek daar weer op (rechtstreeks vanaf het
station lukte niet, omdat de WS5500 geen beveiligde verbinding ondersteunt
die Vercel vereist).

**cron-job.org** — een gratis, externe "wekker"-dienst die elke 5 minuten
automatisch de ophaal-functie van de website aanroept, zodat er continu
nieuwe metingen binnenkomen zonder dat jij daar iets voor hoeft te doen.

**mijn.host** — waar je domeinnaam `mijnweerstation.nl` geregistreerd staat
en de DNS-instellingen (de "routebeschrijving" die je domeinnaam naar
Vercel wijst) worden beheerd.

Deze zes platforms/diensten zijn allemaal **nodig om de site te laten
werken** — als er één wegvalt, stopt (een deel van) de site met
functioneren.

Daarnaast zijn er hulpmiddelen die alleen tijdens het **bouwen en
onderhouden** zijn gebruikt, en die niet nodig zijn om de site online te
houden:

- **Git en PowerShell** (op je eigen computer) — om wijzigingen in de
  broncode vast te leggen en naar GitHub te sturen.
- **Claude** — waarmee de website is ontworpen, gebouwd, getest en
  probleemgevallen zijn opgelost.
- **ESLint en Prettier** — controleren en verzorgen automatisch de
  codekwaliteit en -opmaak tijdens het ontwikkelen.

## 4. Publicatie en beheer

**Hoe de site online is gezet.** De broncode staat in een GitHub-repository
(`Weerstation-WS5500`, hoofdtak `main`). Vercel is aan die repository
gekoppeld en bouwt automatisch een nieuwe, live versie van de site zodra er
iets naar `main` wordt gepusht — meestal binnen een paar minuten zichtbaar.
Je eigen domeinnaam `mijnweerstation.nl` is bij Vercel toegevoegd en wijst
via een DNS-instelling bij mijn.host naar Vercel; Vercel heeft daar
automatisch een geldig SSL-certificaat (het slotje in de browser) bij
uitgegeven.

**Instellingen en geheimen.** Gevoelige gegevens (zoals de databasetoegang
en de sleutels voor Ecowitt) staan niet in de broncode zelf, maar apart
ingesteld in het Vercel-dashboard (en lokaal in een niet-meegestuurd
bestand `.env.local`). Dat voorkomt dat ze per ongeluk openbaar op GitHub
terechtkomen.

**De doorlopende gegevensstroom**, samengevat: het weerstation stuurt
metingen naar Ecowitt.net → elke 5 minuten haalt cron-job.org via de
website die metingen bij Ecowitt op → de website verwerkt en bewaart ze in
TiDB Cloud → alle pagina's lezen daaruit.

**Onderhouden en uitbreiden.** Voor een aanpassing (nieuwe functie,
bugfix, ander uiterlijk) wordt de code gewijzigd en lokaal getest,
daarna naar GitHub gepusht — waarna Vercel automatisch de nieuwe versie
publiceert. Voor wijzigingen die de database raken (bijvoorbeeld een
nieuw soort meting toevoegen) is soms ook een aanpassing van de
databasestructuur nodig, wat via een apart migratiecommando gebeurt. Om
door te kunnen blijven bouwen aan de site zijn dus in elk geval nodig: de
toegang tot de GitHub-repository, het Vercel-account, en de TiDB Cloud-
database. Ecowitt.net, cron-job.org en mijn.host blijven daarnaast nodig
zolang je live gegevens en de eigen domeinnaam wilt behouden.

---

*Dit overzicht beschrijft de website zoals die er nu (september 2026)
voor staat, opgebouwd uit de gezamenlijke ontwikkelsessies. Losse
tussentijdse experimenten, verworpen oplossingen en teruggedraaide
wijzigingen zijn hierin weggelaten.*
