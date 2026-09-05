/**
 * Tijdelijk hulpscript — NIET onderdeel van de normale werkwijze.
 *
 * Doel: `npm run db:migrate` (drizzle-kit) geeft bij een fout geen
 * leesbare foutmelding, alleen een lege foutcode. Dit script voert exact
 * dezelfde SQL-instructies uit db/migrations/0001_ws5500_ingestion.sql één
 * voor één uit, rechtstreeks tegen de database in DATABASE_URL, en toont
 * per instructie of die lukte — inclusief de volledige, echte foutmelding
 * als een instructie mislukt.
 *
 * Veilig om te draaien: dit voert dezelfde instructies uit die
 * `npm run db:migrate` al probeerde. Instructies die al eerder gelukt zijn
 * geven nu een "bestaat al"-foutmelding — dat is een GOED teken (betekent:
 * die stap was al gelukt), geen nieuw probleem.
 *
 * Gebruik:
 *   node scripts/diagnose-migration.mjs
 *
 * Verwijder dit bestand gerust weer zodra het probleem gevonden is.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const MIGRATION_FILE = path.resolve(
  import.meta.dirname,
  "../db/migrations/0001_ws5500_ingestion.sql",
);

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("FOUT: DATABASE_URL staat niet in .env.local. Stop.");
    process.exit(1);
  }

  const conn = parseDatabaseUrl(databaseUrl);
  console.log(
    `Verbinden met ${conn.host}:${conn.port}/${conn.database} als ${conn.user}...`,
  );

  const connection = await mysql.createConnection({
    ...conn,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  console.log("Verbonden.\n");

  const sql = fs.readFileSync(MIGRATION_FILE, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`${statements.length} instructies gevonden in de migratie.\n`);

  let failures = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const preview = statement.length > 90 ? statement.slice(0, 90) + "..." : statement;
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}\n`);
    try {
      await connection.query(statement);
      console.log("   ✅ GELUKT\n");
    } catch (error) {
      failures++;
      console.log("   ❌ MISLUKT");
      console.log(`   Foutcode: ${error.code ?? "onbekend"}`);
      console.log(`   Foutmelding: ${error.sqlMessage ?? error.message}\n`);
    }
  }

  await connection.end();

  console.log("=".repeat(70));
  if (failures === 0) {
    console.log("Alle instructies zijn nu gelukt. De migratie is compleet.");
  } else {
    console.log(
      `${failures} instructie(s) gaven een fout. Stuur de volledige uitvoer hierboven ` +
        "(kopieer de tekst, of maak een screenshot van elke ❌-regel) terug.",
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Onverwachte fout bij het opzetten van de verbinding:");
  console.error(error);
  process.exit(1);
});
