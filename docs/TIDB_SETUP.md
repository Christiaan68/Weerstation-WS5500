# TiDB Cloud instellen

Stap-voor-stap: een gratis TiDB Cloud Serverless-database aanmaken en
koppelen aan dit project. Geen lokale database nodig — alles draait in de
cloud.

## 1. TiDB Cloud-account aanmaken

1. **Waar:** browser, [tidbcloud.com](https://tidbcloud.com).
2. **Wat:** maak een gratis account aan (of log in met een bestaand
   Google/GitHub-account).
3. **Controle:** je komt in het TiDB Cloud-dashboard terecht.

## 2. Cluster (database) aanmaken

1. **Waar:** TiDB Cloud-dashboard.
2. **Wat:** klik op **Create Cluster**. Kies het **Serverless**-type (gratis
   contingent, geen creditcard verplicht voor het gratis tier, schaalt
   automatisch — precies wat dit project nodig heeft).
3. **Inhoud:** geef het cluster een naam (bv. `weerstation`), kies een regio
   dicht bij je Vercel-deployment (bv. een Europese regio) en bevestig.
4. **Controle:** na een paar seconden staat het cluster met status
   "Available" in je clusterlijst.

## 3. Databasegebruiker en wachtwoord

1. **Waar:** TiDB Cloud-dashboard → je cluster → knop **Connect**
   (rechtsboven).
2. **Wat:** in het verbindingsvenster:
   - **Connect With:** `General`
   - **Endpoint Type:** `Public`
   - Klik op **Generate Password** (of **Create password**) als er nog
     geen wachtwoord is. **Bewaar dit wachtwoord direct** — je kunt het
     later niet meer opnieuw laten tonen (wel resetten).
3. **Controle:** het venster toont nu host, poort, gebruikersnaam,
   wachtwoord en databasenaam.

   Voor Fase 1 is de standaard databasegebruiker (vaak iets als
   `<prefix>.root`) voldoende. Wil je later een aparte gebruiker met
   beperktere rechten, dan kan dat via **Connect → Create SQL User**, of
   handmatig met `CREATE USER` / `GRANT` in de SQL-editor.

## 4. Connectiegegevens ophalen

Noteer uit het verbindingsvenster:

- **Host**, bijvoorbeeld `gateway01.eu-central-1.prod.aws.tidbcloud.com`
- **Port**: `4000`
- **User**, bijvoorbeeld `3xamPle.root`
- **Password**: het wachtwoord uit stap 3
- **Database**: standaard `test` — maak voor dit project een eigen database
  aan (zie stap 5) en gebruik die naam in plaats van `test`.

### Eigen database aanmaken

1. **Waar:** TiDB Cloud-dashboard → je cluster → **Chat2Query** of
   **SQL Editor** (of via een MySQL-client met bovenstaande gegevens).
2. **Wat:** voer uit:
   ```sql
   CREATE DATABASE weerstation CHARACTER SET utf8mb4;
   ```
3. **Controle:** `SHOW DATABASES;` toont `weerstation` in de lijst.

## 5. SSL-configuratie

TiDB Cloud vereist een TLS-verbinding, ook voor Serverless. Dit project
regelt dat al voor je in `src/lib/db/index.ts` en `drizzle.config.ts`
(`ssl: { rejectUnauthorized: true }`).

Belangrijk om te weten: TiDB Serverless gebruikt certificaten van een
publiek vertrouwde certificaatautoriteit. Node.js vertrouwt die certificaten
via zijn ingebouwde certificaatstore — **je hoeft dus geen los `ca.pem`-
bestand te downloaden of te configureren.** Zolang je verbindt met
`rejectUnauthorized: true` (de standaard in dit project) werkt de
verbinding zonder extra stappen.

## 6. DATABASE_URL samenstellen

Bouw de connection string in dit formaat:

```
mysql://<user>:<password>@<host>:4000/<database>
```

Met de voorbeeldwaarden hierboven:

```
mysql://3xamPle.root:jouw-wachtwoord@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/weerstation
```

**Let op:** staat er een `@`, `:`, `/` of ander speciaal teken in je
wachtwoord? URL-encodeer dat teken dan (bv. `@` wordt `%40`).

## 7. Lokaal instellen (`.env.local`)

1. **Waar:** projectmap, in een terminal (PowerShell).
2. **Wat:** kopieer `.env.example` naar `.env.local` als dat nog niet
   gedaan is:
   ```powershell
   Copy-Item .env.example .env.local
   ```
3. **Wat:** open `.env.local` en vul `DATABASE_URL` in met de string uit
   stap 6. Laat de overige variabelen staan zoals ze zijn (zie
   `.env.example` voor uitleg per variabele).
4. **Controle:** `.env.local` staat in `.gitignore` — `git status` mag dit
   bestand niet als wijziging tonen.

## 8. In Vercel toevoegen

Zie `docs/VERCEL_SETUP.md` voor de volledige Vercel-inrichting. Kort:
Project Settings → Environment Variables → `DATABASE_URL` toevoegen voor
**Production**, **Preview** én **Development**, met dezelfde waarde als in
`.env.local` (of een aparte database per omgeving, als je dat liever hebt).

## 9. Migrations uitvoeren

1. **Waar:** projectmap, PowerShell, met `DATABASE_URL` ingesteld in
   `.env.local`.
2. **Wat:**
   ```powershell
   npm install
   npm run db:migrate
   ```
3. **Inhoud:** dit voert de SQL-bestanden in `db/migrations/` uit tegen je
   TiDB-database en maakt alle tabellen aan (`stations`,
   `raw_weather_packets`, `weather_observations`, `sensor_measurements`,
   de summary-tabellen en `app_settings`).
4. **Controle:** in de TiDB Cloud SQL-editor toont `SHOW TABLES;` alle
   bovenstaande tabellen.

Optioneel: maak daarna het demo-station aan en genereer wat testdata:

```powershell
npm run db:seed
npm run demo
```

## 10. Verbinding controleren

1. **Waar:** projectmap, PowerShell.
2. **Wat:**
   ```powershell
   npm run dev
   ```
3. **Wat:** open in de browser `http://localhost:3000/api/health`.
4. **Verwachte uitkomst:**
   ```json
   { "status": "ok", "app": "ok", "database": "ok", "timestamp": "..." }
   ```
   Staat er `"database": "error"`? Controleer dan:
   - is `DATABASE_URL` correct overgenomen (geen spaties, wachtwoord goed
     URL-geëncodeerd)?
   - staat het cluster op "Available" in TiDB Cloud?
   - is de databasenaam in de URL ook echt aangemaakt (stap 4)?
