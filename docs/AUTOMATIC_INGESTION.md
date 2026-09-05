# Automatische ingestie (cronjob) — Fase 3

Dit document beschrijft hoe de Ecowitt Cloud-provider (zie
[`docs/WS5500_INGESTION.md`](WS5500_INGESTION.md) §2 en §10) **automatisch en
continu** wordt aangeroepen, zonder dat iemand handmatig een URL hoeft te
openen. Fase 2 bouwde de route (`/api/weather/providers/ecowitt-cloud/[secret]`)
en beschreef de opties; Fase 3 kiest en implementeert een concrete oplossing.

## Inhoud

- [1. Onderzoek: Vercel Cron vs. een externe pinger](#1-onderzoek-vercel-cron-vs-een-externe-pinger)
- [2. Gekozen oplossing: cron-job.org, elke 5 minuten](#2-gekozen-oplossing-cron-joborg-elke-5-minuten)
- [3. Instellen: stap voor stap](#3-instellen-stap-voor-stap)
- [4. Beveiliging](#4-beveiliging)
- [5. Cron-gezondheid controleren](#5-cron-gezondheid-controleren)
- [6. Later overstappen op Vercel Cron (Pro-abonnement)](#6-later-overstappen-op-vercel-cron-pro-abonnement)

## 1. Onderzoek: Vercel Cron vs. een externe pinger

Gecontroleerd tegen de actuele Vercel-documentatie
(`vercel.com/docs/cron-jobs/usage-and-pricing`, geraadpleegd 2026-07-15):

| Plan           | Minimuminterval | Precisie   | Max. cronjobs per project |
| -------------- | --------------- | ---------- | ------------------------- |
| Hobby          | **1× per dag**  | Per uur    | 100                       |
| Pro/Enterprise | 1× per minuut   | Per minuut | 100                       |

Op het Hobby-plan (het plan van dit project) accepteert Vercel geen
cron-expressie die vaker dan eens per dag draait — die wordt al bij deploy
geweigerd. Dat is voor een "live" weerdashboard te grof: eens per dag nieuwe
data zou het hele doel van een live dashboard ondermijnen.

Onderzocht alternatief: [cron-job.org](https://cron-job.org) (gratis, geen
account-limiet op interval) ondersteunt volgens de eigen FAQ intervallen tot
**1× per minuut**, zonder hard maximum op het aantal jobs voor een gratis
account.

**Keuze: cron-job.org**, met een vaste periode. Zodra dit project naar
Vercel Pro verhuist, kan zonder codewijziging teruggeschakeld worden naar
Vercel Cron (zie §6) — de aangeroepen URL blijft exact hetzelfde.

## 2. Gekozen oplossing: cron-job.org, elke 5 minuten

- **Doel-URL**: de al bestaande, beveiligde route uit Fase 2 —
  `https://<jouw-domein>/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>`.
  Geen nieuwe route, geen nieuw secret, geen Vercel-configuratiewijziging
  nodig.
- **Frequentie: elke 5 minuten** (niet elke minuut). Onderbouwing:
  - De WS5500 upload't zelf elke minuut naar Ecowitt.net (in te stellen in de
    WSView Plus-app) — dat is een ANDERE stap dan onze eigen polling, en
    staat hier los van.
  - De Ecowitt Cloud API (`api.ecowitt.net`) heeft geen publiek
    gedocumenteerde rate-limit-garantie voor deze schaal. Elke minuut pollen
    zou 1.440 aanroepen per dag betekenen zonder dat vaststaat dat dat
    probleemloos geaccepteerd wordt; elke 5 minuten (288/dag) is een
    ruime, veilige marge die nog steeds "vrijwel live" aanvoelt op een
    dashboard.
  - Dit interval is de basis voor `DEFAULT_POLL_INTERVAL_SECONDS` (300) in
    `src/lib/weather/summary-service.ts` — dekkingspercentages
    (`coveragePct` in de summary-tabellen) en de cron-gezondheidsindicator
    op `/station` (zie §5) rekenen hiermee. **Wijzig je het interval, werk
    dan ook deze constante bij**, anders klopt de dekkingsberekening niet
    meer.
  - Instelbaar/aan te passen: verhoog naar 1 minuut zodra dit project naar
    Vercel Pro verhuist (zie §6) en `DEFAULT_POLL_INTERVAL_SECONDS`
    dienovereenkomstig bijwerken.

## 3. Instellen: stap voor stap

1. **Waar**: browser, [cron-job.org](https://cron-job.org).
   **Wat**: maak een gratis account aan (of log in).
2. **Waar**: cron-job.org-dashboard → "Create cronjob".
   **Wat**: vul in:
   - **Title**: bijvoorbeeld `Alecto WS5500 — Ecowitt Cloud poll`.
   - **URL**: `https://<jouw-domein>/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>`
     — vervang `<jouw-domein>` door het echte Vercel-domein van deze
     applicatie en `<WEATHER_INGEST_SECRET>` door de waarde die in Vercel
     staat onder **Settings → Environment Variables**. Vul hier de
     **echte** waarde in (dit formulier bewaart 'm versleuteld bij
     cron-job.org) — plak 'm nooit ergens anders (chat, documentatie,
     screenshots).
   - **Schedule**: "Every 5 minutes" (of de custom cron-expressie
     `*/5 * * * *`).
   - **Request method**: `GET`.
   - Laat "Save responses" / "Notifications on failure" gerust aan staan —
     dat toont in cron-job.org zelf of een aanroep foutgaf, handig als extra
     signaal naast de eigen `/station`-pagina.
3. **Waar**: cron-job.org, dezelfde cronjob.
   **Wat**: klik "Save", en daarna eenmalig "Run now" om te testen.
   **Controle**: cron-job.org toont een HTTP-statuscode. Verwacht: `200`
   met een JSON-body die begint met `{"status":"ok"` (of vergelijkbaar,
   zie de route zelf). Een `404` betekent een fout secret/pad; een `5xx`
   betekent een databasefout — controleer in dat geval eerst
   `/api/health`.
4. **Waar**: deze applicatie, `/station`.
   **Wat**: laad de pagina (na de eerste geslaagde run, kan tot 5 minuten
   duren).
   **Controle**: de kaart "Ingestie & datakwaliteit" toont
   **Cronjob-status: Actief**, met een tijdstip bij "Laatste geslaagde
   ophaling" dat overeenkomt met de laatste run.

## 4. Beveiliging

- **Geen nieuw secret** — dezelfde beveiligde, secret-in-pad-route uit Fase 2
  wordt hergebruikt (zie
  [`docs/WS5500_INGESTION.md`](WS5500_INGESTION.md) §3): een fout/ontbrekend
  secret geeft 404, nooit 401/403 (dat zou al bevestigen dát de route
  bestaat).
- **Het secret staat NERGENS in de broncode, git-geschiedenis, logs of deze
  documentatie** — alleen in Vercels environment variables en (versleuteld)
  in het cron-job.org-formulier zelf.
- **De cron-job.org-URL wordt nooit publiek gedeeld of gecommit** — behandel
  'm net zo voorzichtig als een wachtwoord: wie de volledige URL kent, kan
  weerdata namens dit station laten verwerken (al blijft dat beperkt tot
  "een geldige Ecowitt Cloud-respons doorsturen", er is geen willekeurige
  schrijftoegang tot de database).
- **Geen browser-requests, geen client-bundel.** De cronjob draait volledig
  server-naar-server (cron-job.org → Vercel); het secret komt nooit in
  HTML, JavaScript die naar de browser gestuurd wordt, of een publiek
  zichtbare request terecht.
- cron-job.org's eigen requestlogboek bevat de aangeroepen URL (inclusief
  secret) — dat is inherent aan deze aanpak (het secret moet ergens
  "bekend" zijn bij de pinger) en aanvaard risico, vergelijkbaar met elke
  andere third-party-pinger. Bij twijfel: gebruik een eigen server-to-server
  oplossing (bv. Vercel Cron, zie §6) in plaats van een derde partij.

## 5. Cron-gezondheid controleren

`/station` toont een live afgeleide status (`src/lib/weather/cron-health.ts`),
gebaseerd op `weather_provider_state.last_success_at` en het huidige
pollinterval (`DEFAULT_POLL_INTERVAL_SECONDS`, zie §2):

| Status        | Betekenis                                                               |
| ------------- | ----------------------------------------------------------------------- |
| **Actief**    | Laatste geslaagde poll ≤ 10 minuten geleden (2× het pollinterval).      |
| **Vertraagd** | Laatste geslaagde poll 10–30 minuten geleden (tot 6× het pollinterval). |
| **Offline**   | Laatste geslaagde poll > 30 minuten geleden.                            |
| **Onbekend**  | Nog nooit een geslaagde poll geregistreerd.                             |

Bij **Vertraagd**/**Offline**: controleer eerst cron-job.org's eigen
uitvoeringsgeschiedenis (heeft de cronjob wel gedraaid?), daarna
`/api/weather/station/status` (JSON met `lastError`) voor de exacte
foutmelding, en tot slot `/api/health` (staat de database zelf aan?).

## 6. Later overstappen op Vercel Cron (Pro-abonnement)

Zodra dit project een Vercel Pro-abonnement heeft (1×/minuut mogelijk),
overstappen zonder codewijziging:

1. **Waar**: projectmap, nieuw bestand `vercel.json` (of uitbreiden als het
   al bestaat).
   **Wat**: voeg toe:

   ```json
   {
     "crons": [
       {
         "path": "/api/weather/providers/ecowitt-cloud/<WEATHER_INGEST_SECRET>",
         "schedule": "*/1 * * * *"
       }
     ]
   }
   ```

   Let op: `vercel.json` wordt gecommit naar git — zet hier **nooit** de
   echte secret-waarde in platte tekst in een openbare/gedeelde repository.
   Gebruik in dat geval liever een Vercel Cron die een apart,
   niet-geheim pad aanroept dat het secret zelf uit een environment
   variable leest (een kleine aanpassing van de route), of blijf bij
   cron-job.org met het secret alleen in dat formulier.

2. **Waar**: cron-job.org.
   **Wat**: schakel de bestaande cronjob uit (of verwijder 'm) zodra Vercel
   Cron bevestigd actief is — twee gelijktijdige pollers is onschadelijk
   (de deduplicatie op payload-hash, zie
   [`docs/WS5500_INGESTION.md`](WS5500_INGESTION.md) §6, vangt dit netjes
   af) maar onnodig.
3. **Waar**: `src/lib/weather/summary-service.ts`.
   **Wat**: werk `DEFAULT_POLL_INTERVAL_SECONDS` bij naar `60`, zodat
   dekkingspercentages en de cron-gezondheidsindicator weer kloppen.
