# Vercel instellen

Stap-voor-stap: dit project op GitHub zetten en deployen naar Vercel.

## 1. GitHub-repository aanmaken

1. **Waar:** [github.com/new](https://github.com/new).
2. **Wat:** maak een nieuwe (private of public) repository aan, bijvoorbeeld
   `weerstation-ws5500`. Voeg **geen** README/`.gitignore`/license toe via
   GitHub zelf — dit project heeft die al.
3. **Controle:** je ziet een lege repository met een "quick setup"-pagina.

## 2. Code pushen

1. **Waar:** projectmap, PowerShell.
2. **Wat:**
   ```powershell
   git init
   git add .
   git commit -m "Fase 1: technische fundering"
   git branch -M main
   git remote add origin https://github.com/<jouw-gebruikersnaam>/weerstation-ws5500.git
   git push -u origin main
   ```
   (Sla `git init` over als de map al een git-repository is.)
3. **Controle:** de bestanden staan zichtbaar in de GitHub-repository.

## 3. Repository in Vercel importeren

1. **Waar:** [vercel.com/new](https://vercel.com/new).
2. **Wat:** log in met je GitHub-account, klik **Import** naast de
   `weerstation-ws5500`-repository.
3. **Controle:** je komt op de configuratiepagina voor het nieuwe project.

## 4. Framework detection

1. **Wat:** Vercel herkent dit automatisch als een **Next.js**-project
   (Framework Preset: Next.js). Build- en outputinstellingen hoef je niet
   aan te passen.
2. **Controle:** "Framework Preset" staat op `Next.js`.

## 5. Environment variables instellen

1. **Waar:** op dezelfde configuratiepagina (of later: Project → Settings →
   Environment Variables).
2. **Wat:** voeg per variabele uit `.env.example` een waarde toe. Voor elke
   variabele kun je aangeven voor welke omgevingen (Production, Preview,
   Development) die geldt — voor dit project is dezelfde waarde in alle
   drie meestal prima:

   | Variabele                                                            | Waarde                                                     | Omgevingen                       |
   | -------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
   | `DATABASE_URL`                                                       | je TiDB Cloud connection string (zie `docs/TIDB_SETUP.md`) | Production, Preview, Development |
   | `NEXT_PUBLIC_STATION_NAME`                                           | bv. `Alecto WS5500`                                        | Production, Preview, Development |
   | `NEXT_PUBLIC_TIMEZONE`                                               | `Europe/Amsterdam`                                         | Production, Preview, Development |
   | `NEXT_PUBLIC_DEMO_MODE`                                              | `true` zolang er geen echte stationdata is                 | Production, Preview, Development |
   | `WEATHER_INGEST_SECRET`                                              | een zelfgekozen, willekeurige waarde                       | Production, Preview, Development |
   | `ECOWITT_APPLICATION_KEY` / `ECOWITT_API_KEY` / `ECOWITT_DEVICE_MAC` | leeg laten in Fase 1                                       | —                                |

3. **Controle:** alle variabelen staan in de lijst met het juiste "scope"
   (Production/Preview/Development).

## 6. DATABASE_URL instellen

Zie de tabel hierboven — dit is de belangrijkste variabele. Zonder een
geldige `DATABASE_URL` bouwt en start de site nog steeds (zie
`docs/ARCHITECTURE.md` §6), maar toont `/api/health` en `/station`
`"database": "error"` totdat deze correct is ingesteld.

## 7. Deployment

1. **Wat:** klik **Deploy**.
2. **Controle:** Vercel bouwt het project (`npm ci` → `npm run build`) en
   toont na een paar minuten "Congratulations" met een live URL zoals
   `weerstation-ws5500.vercel.app`.

## 8. Build logs controleren

1. **Waar:** Vercel-dashboard → project → tabblad **Deployments** → klik de
   deployment aan → **Building**-sectie.
2. **Controle:** geen rode foutregels; de laatste regel is doorgaans
   `Build Completed`.

## 9. `/api/health` testen

1. **Waar:** browser.
2. **Wat:** open `https://<jouw-project>.vercel.app/api/health`.
3. **Verwachte uitkomst:**
   ```json
   { "status": "ok", "app": "ok", "database": "ok", "timestamp": "..." }
   ```
4. Loop bij `"database": "error"` de checklist onderaan
   `docs/TIDB_SETUP.md` na.

## 10. Custom domain (later)

Optioneel, niet nodig voor Fase 1:

1. **Waar:** Vercel-dashboard → project → **Settings** → **Domains**.
2. **Wat:** voeg je eigen domein toe en volg de DNS-instructies die Vercel
   toont (meestal een `CNAME`- of `A`-record bij je domeinregistrar).
3. **Controle:** het domein krijgt in Vercel het label "Valid Configuration"
   zodra de DNS is doorgevoerd (kan tot enkele uren duren).
