/**
 * Server-only database access layer.
 *
 * Belangrijk: dit bestand mag NOOIT geïmporteerd worden vanuit client-code
 * ('use client'-bestanden of componenten die in de browser draaien). Alle
 * databasecommunicatie loopt via server components, route handlers en
 * losse scripts (`scripts/seed.ts`, `scripts/generate-demo-weather.ts`).
 *
 * We gebruiken bewust GEEN `import "server-only"` hier: dat pakket werkt
 * alleen binnen Next.js' eigen bundler-resolutie en gooit een fout zodra
 * dit bestand buiten Next.js wordt geïmporteerd (bv. door de seed-/demo-
 * scripts via `tsx`). De runtime-guard in `getServerEnv()`
 * (`typeof window !== "undefined"`) vangt een per ongeluk client-side
 * gebruik al op.
 *
 * Serverless- en build-aandachtspunten (Vercel Functions):
 * - We maken één `mysql2`-pool aan per proces ("lazy singleton"): de pool
 *   wordt pas aangemaakt bij de EERSTE daadwerkelijke databaseaanroep, niet
 *   bij het importeren van dit bestand. Next.js voert tijdens `next build`
 *   route-modules uit om op te halen welke routes statisch/dynamisch zijn;
 *   zonder deze lazy-opzet zou een build zonder (geldige) DATABASE_URL
 *   kunnen falen. Zie ook `export const dynamic = "force-dynamic"` in
 *   `src/app/api/health/route.ts`.
 * - Eenmaal aangemaakt wordt de pool hergebruikt via een module-singleton
 *   (met een `globalThis`-cache in development, zodat Next.js' hot-module-
 *   reload niet telkens een nieuwe pool opent).
 * - De pool heeft een klein `connectionLimit`. Vercel Functions schalen
 *   horizontaal (meerdere instanties tegelijk), dus een kleine limiet per
 *   instantie voorkomt dat we gezamenlijk het verbindingsmaximum van TiDB
 *   Cloud opsouperen.
 * - TiDB Cloud (Serverless en Dedicated) vereist TLS. TiDB Serverless
 *   gebruikt certificaten van een publiek vertrouwde CA, dus het standaard
 *   Node.js-certificaatstore volstaat (`rejectUnauthorized: true`, geen
 *   losse ca.pem nodig). Zie docs/TIDB_SETUP.md.
 * - We gebruiken de Node.js-runtime (niet Edge) omdat de `mysql2`-driver
 *   Node-only TCP-sockets gebruikt. Dit is sinds Next.js 16 sowieso de
 *   standaard runtime (Edge is deprecated).
 */
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql, { type Pool } from "mysql2/promise";

import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

type AppDatabase = MySql2Database<typeof schema>;

function createPool(): Pool {
  const { DATABASE_URL } = getServerEnv();

  let url: URL;
  try {
    url = new URL(DATABASE_URL);
  } catch {
    throw new Error(
      "DATABASE_URL is geen geldige URL. Verwacht formaat: mysql://user:password@host:4000/database",
    );
  }

  const database = url.pathname.replace(/^\//, "");

  if (!database) {
    throw new Error("DATABASE_URL mist een databasenaam (het pad na de host).");
  }

  return mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: {
      minVersion: "TLSv1.2",
      // TiDB Cloud gebruikt publiek vertrouwde certificaten (Serverless en
      // Dedicated). Het Node.js-certificaatstore is voldoende.
      rejectUnauthorized: true,
    },
    // KRITIEK: forceer UTC voor alle Date-parameters die mysql2 naar de
    // database serialiseert. Zonder deze instelling valt mysql2 terug op
    // `timezone: "local"`, wat betekent dat een JS `Date`-object wordt
    // omgezet naar een DATETIME-string op basis van de LOKALE tijdzone van
    // het proces dat de query uitvoert — niet UTC. Op Vercel (waar functies
    // standaard in UTC draaien) viel dit niet op, maar bij het rechtstreeks
    // draaien van scripts vanaf een pc in Europe/Amsterdam (UTC+2 in de
    // zomer) leidde dit tot een structurele verschuiving van enkele uren in
    // elke `<`/`>`/`gte`/`lte`-vergelijking op een timestamp-kolom. Concreet
    // bewezen op 2026-09-05: `listRawPacketsBySourceBefore()` met cutoff
    // 14:10:00 UTC gaf ten onrechte ook pakket #60001 (14:13:14 UTC, dus NA
    // de cutoff) terug, omdat de cutoff als "16:10:00 lokale tijd" werd
    // verstuurd en door de (UTC-)sessie van TiDB Cloud als 16:10:00 UTC werd
    // geïnterpreteerd. Alle timestamp-kolommen in dit project representeren
    // UTC-instanten (zie schema.ts); `"Z"` maakt serialisatie/parsing aan
    // beide kanten expliciet en consistent UTC, onafhankelijk van waar het
    // proces draait.
    timezone: "Z",
    // Klein en bewust: zie toelichting bovenaan dit bestand.
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Voorkomt dat de pool onbeperkt wacht op een vrije connectie.
    queueLimit: 0,
    connectTimeout: 10_000,
  });
}

declare global {
  var __weerstationDbPool: Pool | undefined;
  var __weerstationDb: AppDatabase | undefined;
}

/**
 * Maakt (of hergebruikt) de mysql2-pool. Wordt pas aangeroepen bij gebruik.
 *
 * We cachen ALTIJD via `globalThis` (dus ook in productie) — niet alleen in
 * development. `globalThis` is puur bedoeld om de pool te laten overleven
 * tussen Next.js' hot-module-reloads in `next dev`; in productie (`next
 * start`, of een lang-levende Vercel-instantie) is er geen HMR, dus caching
 * daar is even veilig en juist noodzakelijk. Zonder deze cache in productie
 * werd er per databaseaanroep een GEHEEL NIEUWE `mysql2`-pool aangemaakt
 * (met eigen TCP/TLS-verbindingen die nooit gesloten werden), wat bij
 * voortdurend verkeer al snel het verbindingsmaximum van TiDB Cloud
 * opsoupeert — merkbaar als afwisselend hangende en falende paginaladingen.
 */
function getPool(): Pool {
  if (globalThis.__weerstationDbPool) {
    return globalThis.__weerstationDbPool;
  }

  const newPool = createPool();
  globalThis.__weerstationDbPool = newPool;

  return newPool;
}

/** Maakt (of hergebruikt) de Drizzle-database-instantie. Lazy, zie boven. */
function getDb(): AppDatabase {
  if (globalThis.__weerstationDb) {
    return globalThis.__weerstationDb;
  }

  const instance = drizzle(getPool(), { schema, mode: "default" });
  globalThis.__weerstationDb = instance;

  return instance;
}

/**
 * Drizzle-database-instantie met het volledige schema.
 *
 * Dit is een lichte proxy: de eigenlijke pool/verbinding wordt pas
 * aangemaakt bij de eerste daadwerkelijke query (`db.select(...)`,
 * `db.insert(...)`, enz.), niet bij het importeren van deze module. Gebruik
 * `db` verder gewoon als een normale Drizzle-instantie.
 */
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});

/**
 * Voert een lichte `SELECT 1` uit om te controleren of de database
 * bereikbaar is. Gebruikt door `/api/health` en `getDatabaseHealth()`.
 * Gooit nooit een fout; geeft altijd een gestructureerd resultaat terug.
 */
export async function pingDatabase(): Promise<
  { ok: true; latencyMs: number } | { ok: false; error: string }
> {
  const start = Date.now();
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    // Geen stack traces of connectiedetails lekken; alleen een korte,
    // veilige boodschap voor logging/response.
    const message = error instanceof Error ? error.message : "Onbekende databasefout";
    return { ok: false, error: message };
  }
}

export { schema };
export type { AppDatabase };
