/**
 * Configuratie voor drizzle-kit (migraties genereren/uitvoeren).
 *
 * Wordt uitsluitend via `npm run db:*`-scripts gebruikt (zie package.json),
 * nooit door de applicatie zelf. Leest DATABASE_URL rechtstreeks uit
 * process.env zodat dit bestand ook buiten Next.js (los CLI-gebruik) werkt.
 */
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Laad .env.local (lokale ontwikkeling) zonder bestaande env-vars te
// overschrijven, zodat CI/Vercel-omgevingsvariabelen altijd voorrang houden.
loadEnv({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL ontbreekt. Zet deze in .env.local (lokaal) voordat je een db:*-script draait. Zie .env.example en docs/TIDB_SETUP.md.",
  );
}

const url = new URL(databaseUrl);

export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: {
      rejectUnauthorized: true,
    },
  },
  strict: true,
  verbose: true,
});
